import { useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, store } from '../store/gameStore';
import {
    setMyPlayerInfo,
    updatePlayerName as updatePlayerNameAction,
    startSearching,
    setWaitingState,
    setGameState,
    setConnected,
    setError,
    clearError,
} from '../store/onlineGameStore';
import {
    generatePlayerId,
    startMatchmaking,
    readyMatch,
    confirmMatch,
    initializePusherConnection,
} from '../lib/onlineGameFunctions';

/**
 * オンラインマッチング機能を提供するフック
 * プレイヤーの初期化、マッチング開始、Pusher接続の管理を行う
 */
export const useOnlineMatching = () => {
    const dispatch = useDispatch();
    const onlineGame = useSelector((state: RootState) => state.onlineGame);
    const pusherRef = useRef<any>(null);

    /**
     * プレイヤー情報を初期化
     * @param name プレイヤー名
     * @returns 生成されたプレイヤーID
     */
    const initializePlayer = useCallback((name: string) => {
        const playerId = generatePlayerId();
        dispatch(setMyPlayerInfo({ id: playerId, name }));
        return playerId;
    }, [dispatch]);

    /**
     * プレイヤー名を更新
     * @param name 新しいプレイヤー名
     */
    const updatePlayerName = useCallback((name: string) => {
        dispatch(updatePlayerNameAction(name));
    }, [dispatch]);

    /**
     * マッチング開始処理
     * @returns マッチング結果（tentative時はgameIdとopponentId、waiting時はgameId、失敗時はnull）
     */
    const startMatchmakingProcess = useCallback(async () => {
        if (!onlineGame.myPlayerId || !onlineGame.myPlayerName.trim()) {
            dispatch(setError('プレイヤー情報が設定されていません'));
            return null;
        }

        dispatch(startSearching());

        const result = await startMatchmaking(onlineGame.myPlayerId, onlineGame.myPlayerName);

        if (result.success) {
            if (result.status === 'tentative' && result.gameId) {
                // 仮マッチング成功（find-matchではゲーム状態は作成されない）
                console.log('仮マッチング成功、ready-matchを送信します');

                return {
                    type: 'tentative',
                    gameId: result.gameId,
                    opponentId: result.opponentId,
                    opponentName: result.opponentName
                };
            } else if (result.status === 'waiting' && result.gameId) {
                // 待機中 - game_idとstatusを設定
                dispatch(setWaitingState({ id: result.gameId }));
                console.log('待機中、game_idチャンネルを購読します:', result.gameId);
                return {
                    type: 'waiting',
                    gameId: result.gameId
                };
            }
        } else {
            dispatch(setError(result.message || 'エラーが発生しました'));
        }

        return null;
    }, [onlineGame.myPlayerId, onlineGame.myPlayerName, dispatch]);

    /**
     * マッチング準備完了通知
     * @param gameId ゲームID
     * @param opponentId 相手のID
     * @param opponentName 相手の名前
     * @returns マッチング結果
     */
    const readyMatchProcess = useCallback(async (gameId: string, opponentId: string, opponentName: string) => {
        if (!onlineGame.myPlayerId || !onlineGame.myPlayerName) {
            dispatch(setError('プレイヤー情報が設定されていません'));
            return null;
        }

        console.log('ready-matchを送信:', gameId);
        const result = await readyMatch(
            gameId,
            onlineGame.myPlayerId,
            onlineGame.myPlayerName,
            opponentId,
            opponentName
        );

        if (result.success && result.status === 'playing' && result.game) {
            // ゲーム開始
            console.log('マッチング確定、ゲーム開始');
            dispatch(setGameState({
                id: result.game.id,
                players: result.game.players,
                board: result.game.board,
                currentPlayer: result.game.current_player,
                status: 'playing',
                winner: result.game.winner
            }));
            dispatch(setConnected(true));
            return { success: true, status: 'playing', game: result.game };
        } else if (result.status === 'timeout') {
            // タイムアウト
            dispatch(setError('相手の応答がありませんでした'));
            return { success: false, status: 'timeout' };
        } else {
            dispatch(setError(result.message || 'エラーが発生しました'));
            return { success: false };
        }
    }, [onlineGame.myPlayerId, onlineGame.myPlayerName, dispatch]);

    /**
     * マッチング確認
     * @param gameId ゲームID
     */
    const confirmMatchProcess = useCallback(async (gameId: string) => {
        // 最新の状態をReduxから直接取得
        const currentState = store.getState().onlineGame;
        console.log('confirmMatchProcess呼び出し:', {
            gameId,
            myPlayerId: currentState.myPlayerId,
            gameIdFromState: currentState.id
        });

        if (!currentState.myPlayerId) {
            console.error('myPlayerIdがありません');
            return;
        }

        // gameIdが渡されていない場合はReduxの状態から取得
        const actualGameId = gameId || currentState.id;

        if (!actualGameId) {
            console.error('gameIdがありません');
            return;
        }

        console.log('confirm-matchを送信:', actualGameId, currentState.myPlayerId);
        await confirmMatch(actualGameId, currentState.myPlayerId);
    }, []);

    /**
     * ゲーム状態を設定（Pusherイベント受信時）
     * @param gameData ゲームデータ
     */
    const setGameStateProcess = useCallback((gameData: any) => {
        console.log('GameStartイベント受信:', gameData); // デバッグ用
        console.log('自分のプレイヤーID:', onlineGame.myPlayerId);
        console.log('プレイヤー情報:', gameData.players);

        dispatch(setGameState({
            id: gameData.id,
            players: gameData.players,
            board: gameData.board,
            currentPlayer: gameData.current_player,
            status: gameData.status,
            winner: gameData.winner
        }));
        dispatch(setConnected(true));
    }, [dispatch, onlineGame.myPlayerId]);

    /**
     * Pusher接続を初期化（待機中チャンネル用）
     * @param onGameMatchedCallback マッチング成功時のコールバック
     */
    const initializeWaitingPusher = useCallback((onGameMatchedCallback: (gameData: any) => void) => {
        console.log('待機中Pusher接続開始'); // デバッグ用

        const onGameStart = (data: any) => {
            console.log('GameStartイベント受信 (待機チャンネル):', data); // デバッグ用
            setGameStateProcess(data.game);
            onGameMatchedCallback(data.game);
        };

        // 待機中プレイヤー用のPusher接続
        pusherRef.current = initializePusherConnection('waiting-players', onGameStart, () => {}, () => {});

        dispatch(setConnected(true));
    }, [setGameStateProcess, dispatch]);

    /**
     * エラーをクリア
     */
    const clearErrorProcess = useCallback(() => {
        dispatch(clearError());
    }, [dispatch]);

    /**
     * Pusher接続を切断
     */
    const disconnectPusher = useCallback(() => {
        if (pusherRef.current) {
            pusherRef.current.disconnect();
            pusherRef.current = null;
        }
    }, []);

    return {
        onlineGame,
        initializePlayer,
        updatePlayerName,
        startMatchmaking: startMatchmakingProcess,
        readyMatch: readyMatchProcess,
        confirmMatch: confirmMatchProcess,
        initializeWaitingPusher,
        clearError: clearErrorProcess,
        disconnectPusher,
        pusherRef,
    };
};

