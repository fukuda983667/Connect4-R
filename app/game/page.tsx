"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setGameMode } from '../store/gameStore';
import { useGameLogic } from '../hooks/useGameLogic';
import { useGameActions } from '../hooks/useGameActions';
import { useCpuLogic } from '../hooks/useCpuLogic';
import { useStoneAnimation } from '../hooks/useStoneAnimation';
import { useRotationAnimation } from '../hooks/useRotationAnimation';
import { useOnlineMatching } from '../hooks/useOnlineMatching';
import { useOnlineGame } from '../hooks/useOnlineGame';
import { createPusherInstance } from '../lib/pusher';
import { subscribeToGame } from '../lib/pusher';
import { useRouter } from 'next/navigation';

export default function GamePage() {
    const router = useRouter();
    const board = useSelector((state: RootState) => state.game.board);
    const currentPlayer = useSelector((state: RootState) => state.game.currentPlayer);
    const gameStatus = useSelector((state: RootState) => state.game.gameStatus);
    const gameMode = useSelector((state: RootState) => state.game.gameMode);
    const animation = useSelector((state: RootState) => state.game.animation);
    const dispatch = useDispatch();
    const { checkWin, checkDraw } = useGameLogic();
    const { handleColumnClick } = useGameActions();
    const { makeCpuMove } = useCpuLogic();
    const { animateStoneDrop, cleanup } = useStoneAnimation();
    const { animateRotation, cleanup: cleanupRotation } = useRotationAnimation();

    const [hoveredColumn, setHoveredColumn] = React.useState<number | null>(null);

    // タイマー関連の状態
    const [timeLeft, setTimeLeft] = useState<number>(30);
    const [timerActive, setTimerActive] = useState<boolean>(false);

    // マッチング用のタイマー状態
    const [matchingTimeLeft, setMatchingTimeLeft] = useState<number>(30);
    const [matchingTimerActive, setMatchingTimerActive] = useState<boolean>(false);
    const [matchingFailed, setMatchingFailed] = useState<boolean>(false);

    // オンライン対戦用のマッチング機能
    const {
        onlineGame,
        initializePlayer,
        updatePlayerName,
        startMatchmaking,
        readyMatch,
        confirmMatch,
        clearError,
        pusherRef: matchingPusherRef,
    } = useOnlineMatching();

    // オンライン対戦用のゲーム機能
    const {
        makeMove,
        rotateBoard: rotateBoardOnline,
        leaveGame,
        initializePusher,
        getPlayerColor,
        isMyTurn,
        getEmptyRow: getOnlineEmptyRow,
        pusherRef,
        animateOnlineRotation,
    } = useOnlineGame();

    // ゲーム状態を設定する関数を取得
    const setGameState = useCallback((gameData: any) => {
        // Reduxストアにゲーム状態を設定
        dispatch({
            type: 'onlineGame/setGameState',
            payload: {
                id: gameData.id,
                players: gameData.players,
                board: gameData.board,
                currentPlayer: gameData.current_player,
                status: gameData.status,
                winner: gameData.winner
            }
        });
    }, [dispatch]);

    // オンライン対戦モードの状態
    const [showOnlineSetup, setShowOnlineSetup] = useState(false);

    useEffect(() => {
        if (gameStatus === 'won' || gameStatus === 'draw') {
            router.push('/game/result');
        }
    }, [gameStatus, router]);

    // オンライン対戦のゲーム終了時の遷移
    useEffect(() => {
        if (gameMode === 'online' && (onlineGame.status === 'won' || onlineGame.status === 'draw')) {
            router.push('/game/result');
        }
    }, [gameMode, onlineGame.status, router]);

    // オンライン対戦の初期化
    useEffect(() => {
        if (gameMode === 'online' && !onlineGame.myPlayerId) {
            initializePlayer('Player');
            setShowOnlineSetup(true);
        }
    }, [gameMode, onlineGame.myPlayerId, initializePlayer]);

    // タイマーの管理
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;

        if (timerActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prevTime) => prevTime - 1);
            }, 1000);
        } else if (timeLeft === 0 && timerActive) {
            // 時間切れ時の処理
            if (gameMode === 'online' && onlineGame.status === 'playing' && isMyTurn()) {
                // ランダムに空いている列を選択
                const availableColumns = [];
                for (let col = 0; col < 7; col++) {
                    if (getOnlineEmptyRow(col) !== -1) {
                        availableColumns.push(col);
                    }
                }

                if (availableColumns.length > 0) {
                    const randomColumn = availableColumns[Math.floor(Math.random() * availableColumns.length)];
                    console.log('時間切れ: ランダムに列', randomColumn, 'に石を配置');
                    makeMove(randomColumn);
                }
            }
            setTimerActive(false);
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [timerActive, timeLeft, gameMode, onlineGame.status, isMyTurn, getOnlineEmptyRow, makeMove]);

    // 手番が変わった時のタイマーリセット
    useEffect(() => {
        if (gameMode === 'online' && onlineGame.status === 'playing') {
            if (isMyTurn()) {
                setTimeLeft(30);
                setTimerActive(true);
            } else {
                setTimerActive(false);
            }
        }
    }, [gameMode, onlineGame.status, onlineGame.currentPlayer, isMyTurn]);

    // マッチングタイマーの管理
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;

        if (matchingTimerActive && matchingTimeLeft > 0) {
            interval = setInterval(() => {
                setMatchingTimeLeft((prevTime) => prevTime - 1);
            }, 1000);
        } else if (matchingTimeLeft === 0 && matchingTimerActive) {
            // マッチング時間切れ
            setMatchingFailed(true);
            setMatchingTimerActive(false);
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [matchingTimerActive, matchingTimeLeft]);

    // マッチング成功時のタイマーリセット
    useEffect(() => {
        if (onlineGame.status === 'playing' && matchingTimerActive) {
            setMatchingTimerActive(false);
            setMatchingFailed(false);
            setMatchingTimeLeft(30);
        }
    }, [onlineGame.status, matchingTimerActive]);

    // ゲームチャンネルのPusher接続管理（tentative/waitingどちらも）
    useEffect(() => {
        if (gameMode === 'online' && onlineGame.id && !onlineGame.isConnected &&
            (onlineGame.status === 'tentative' || onlineGame.status === 'waiting')) {
            console.log('Pusher接続開始 - game_id:', onlineGame.id, 'status:', onlineGame.status);

            // ゲームチャンネルに接続
            const pusherInstance = createPusherInstance();
            const gameChannel = subscribeToGame(pusherInstance, onlineGame.id);

            // 接続完了を記録
            gameChannel.bind('pusher:subscription_succeeded', () => {
                console.log('Pusherチャンネル購読成功:', `game.${onlineGame.id}`);
            });

            // 仮マッチング通知を受信（待機中のプレイヤー用）
            gameChannel.bind('tentative.match', (data: any) => {
                console.log('仮マッチング通知受信:', data);
                // 即座にconfirm-matchを送信
                confirmMatch(data.game_id);
            });

            // ゲーム開始通知を受信
            gameChannel.bind('game.start', (data: any) => {
                console.log('ゲーム開始通知受信:', data);
                if (data.game && onlineGame.myPlayerId && data.game.players[onlineGame.myPlayerId]) {
                    // ゲームの状態を完全に更新
                    setGameState(data.game);

                    // ゲームチャンネルに再接続（ゲーム中のイベントを受信するため）
                    gameChannel.unbind('tentative.match');
                    gameChannel.unbind('game.start');
                    pusherRef.current = initializePusher(data.game.id);

                    // セットアップ画面を非表示
                    setShowOnlineSetup(false);
                }
            });

            // クリーンアップ関数
            return () => {
                console.log('Pusher接続クリーンアップ - status:', onlineGame.status);
                if (onlineGame.status === 'playing') {
                    // ゲーム中は接続を維持
                    return;
                }
                gameChannel.unbind('pusher:subscription_succeeded');
                gameChannel.unbind('tentative.match');
                gameChannel.unbind('game.start');
                gameChannel.unsubscribe();
                pusherInstance.disconnect();
            };
        }
    }, [gameMode, onlineGame.id, onlineGame.status, onlineGame.isConnected, onlineGame.myPlayerId]);



    useEffect(() => {
        if (gameMode === 'cpu' && currentPlayer === 'yellow' && gameStatus === 'playing' && !animation.isAnimating && !animation.isRotating && !animation.isDroppingStones) {
            const timer = setTimeout(() => {
                makeCpuMove();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [currentPlayer, gameMode, gameStatus, makeCpuMove, animation.isAnimating, animation.isRotating, animation.isDroppingStones]);

    // アニメーションのクリーンアップ
    useEffect(() => {
        return () => {
            cleanup();
            cleanupRotation();
        };
    }, [cleanup, cleanupRotation]);

    const getEmptyRow = (columnIndex: number): number => {
        for (let row = 6; row >= 0; row--) {
            if (board[row][columnIndex] === null) {
                return row;
            }
        }
        return -1;
    };

    const isAnimatingStone = (rowIndex: number, colIndex: number): boolean => {
        return animation.animatingStone !== null &&
                animation.animatingStone.row === rowIndex &&
                animation.animatingStone.column === colIndex;
    };

    const getStoneAnimationStyle = (rowIndex: number, colIndex: number) => {
        if (!isAnimatingStone(rowIndex, colIndex) || !animation.animatingStone) {
            return {};
        }

        // アニメーション中の石の位置を計算
        const currentY = animation.animatingStone.endY;

        return {
            transform: `translateY(${currentY}px)`,
            transition: 'none' // CSS transitionを無効にして、JavaScriptで制御
        };
    };

    // 落下アニメーション中の石の位置を計算
    const getDroppingStonePosition = (rowIndex: number, colIndex: number) => {
        if (!animation.isDroppingStones || !animation.droppingStones) {
            return null;
        }

        const droppingStone = animation.droppingStones.find(
            stone => stone.startRow === rowIndex && stone.col === colIndex
        );


        if (!droppingStone) {
            return null;
        }

        const progress = animation.dropProgress;
        // セルの高さ（64px）+ マージン（8px）= 72px
        const cellHeight = 64;
        const cellGap = 8;
        const totalCellHeight = cellHeight + cellGap;

        // 現在のセル位置を基準とした相対的な移動距離を計算
        const relativeStartY = (droppingStone.startRow - rowIndex) * totalCellHeight;
        const relativeEndY = (droppingStone.endRow - rowIndex) * totalCellHeight;
        const currentRelativeY = relativeStartY + (relativeEndY - relativeStartY) * progress;

        return {
            transform: `translateY(${currentRelativeY}px)`,
            transition: 'none'
        };
    };

    // 表示するボードを決定
    const displayBoard = animation.isDroppingStones && animation.settledBoard
        ? animation.settledBoard
        : board;

    // 落下アニメーション中に石を表示するかどうかを判定
    const shouldShowStone = (rowIndex: number, colIndex: number, cell: string | null) => {
    // 回転アニメーション中または落下アニメーション中は、回転後の盤面を基準にする
    if ((animation.isRotating || animation.isDroppingStones) && animation.rotatedBoard) {
        const rotatedCell = animation.rotatedBoard[rowIndex][colIndex];
        return rotatedCell !== null;
    }

        // 落下アニメーション中は、落下中の石の情報を基準にする
        if (animation.isDroppingStones && animation.droppingStones) {
            // このセルに落下中の石があるかチェック
            const droppingStone = animation.droppingStones.find(
                stone => stone.col === colIndex && stone.startRow === rowIndex
            );

            if (droppingStone) {
                return true; // 落下中の石の開始位置を表示
            }

            // 落下後の盤面で石があるかチェック
            if (animation.settledBoard) {
                return animation.settledBoard[rowIndex][colIndex] !== null;
            }
        }

        // 通常の表示
        return cell !== null;
    };

    const getStoneColor = (rowIndex: number, colIndex: number, cell: string | null) => {
        // 回転アニメーション中は、回転後の盤面を基準にする
        if (animation.isRotating && animation.rotatedBoard) {
            const rotatedCell = animation.rotatedBoard[rowIndex][colIndex];
            if (rotatedCell !== null) {
                return rotatedCell === 'red' ? 'bg-red-500' : 'bg-yellow-500';
            }
        }

        // 落下アニメーション中は、落下中の石のplayerプロパティを使用
        if (animation.isDroppingStones && animation.droppingStones) {
            const droppingStone = animation.droppingStones.find(
                stone => stone.col === colIndex && stone.startRow === rowIndex
            );

            if (droppingStone) {
                return droppingStone.player === 'red' ? 'bg-red-500' : 'bg-yellow-500';
            }

            // 落下後の盤面で石がある場合は、その色を使用
            if (animation.settledBoard) {
                const settledCell = animation.settledBoard[rowIndex][colIndex];
                if (settledCell !== null) {
                    return settledCell === 'red' ? 'bg-red-500' : 'bg-yellow-500';
                }
            }
        }

        // 通常の色の決定
        return cell === 'red' ? 'bg-red-500' : 'bg-yellow-500';
    };

    // オンライン対戦のセットアップ画面
    if (gameMode === 'online' && (showOnlineSetup || onlineGame.status === 'waiting')) {
        return (
            <div className="container mx-auto py-8">
                <div className="flex flex-col items-center justify-center p-8">
                    <h1 className="text-4xl font-bold mb-8 text-gray-800">オンライン対戦</h1>
                    <div className="bg-white p-8 rounded-lg shadow-lg w-96">
                        <div className="mb-4">
                            <label htmlFor="playerName" className="block text-sm font-medium text-gray-700 mb-2">
                                プレイヤー名
                            </label>
                            <input
                                type="text"
                                id="playerName"
                                value={onlineGame.myPlayerName}
                                onChange={(e) => updatePlayerName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="プレイヤー名を入力"
                                disabled={onlineGame.isSearching}
                            />
                        </div>

                        {/* マッチングタイマー表示 */}
                        {matchingTimerActive && (
                            <div className="mb-4 text-center">
                                <div className="text-lg font-semibold text-gray-700 mb-3">
                                    マッチング中... 残り時間: {matchingTimeLeft}秒
                                </div>
                                <div className="flex justify-center">
                                    <div className="relative">
                                        {/* 外側の円 */}
                                        <div className="w-12 h-12 border-4 border-gray-200 rounded-full"></div>
                                        {/* 回転する円 */}
                                        <div
                                            className="absolute top-0 left-0 w-12 h-12 border-4 border-transparent rounded-full animate-spin border-t-blue-500"
                                        style={{ animationDuration: '1s' }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* マッチング失敗時の表示 */}
                        {matchingFailed && (
                            <div className="mb-4 text-center">
                                <div className="text-lg font-semibold text-red-600 mb-2">
                                    対戦相手が見つかりませんでした。
                                </div>
                            </div>
                        )}

                        <div className="flex space-x-4">
                            {!matchingFailed ? (
                                <button
                                    onClick={async () => {
                                        const result = await startMatchmaking();
                                        if (result) {
                                            // マッチングタイマーを開始
                                            setMatchingTimerActive(true);
                                            setMatchingTimeLeft(30);

                                            if (result.type === 'tentative') {
                                                // 仮マッチング成功 - ready-matchを送信
                                                console.log('仮マッチング成功、ready-matchを送信');
                                                const readyResult = await readyMatch(
                                                    result.gameId,
                                                    result.opponentId!,
                                                    result.opponentName!
                                                );

                                                if (readyResult && readyResult.success) {
                                                    // ゲーム開始成功
                                                    console.log('ゲーム開始成功');
                                                    pusherRef.current = initializePusher(result.gameId);
                                                    setShowOnlineSetup(false);
                                                    setMatchingTimerActive(false);
                                                } else if (readyResult && readyResult.status === 'timeout') {
                                                    // タイムアウト
                                                    console.log('マッチングタイムアウト');
                                                    setMatchingFailed(true);
                                                    setMatchingTimerActive(false);
                                                }
                                            } else if (result.type === 'waiting') {
                                                // 待機中 - Pusherイベントを待つ
                                                console.log('待機中、Pusherイベントを待機');
                                            }
                                        }
                                    }}
                                    disabled={onlineGame.isSearching || !onlineGame.myPlayerName.trim() || matchingTimerActive}
                                    className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded transition-colors"
                                >
                                    {onlineGame.isSearching ? '検索中...' : '対戦相手を探す'}
                                </button>
                            ) : (
                                <button
                                    onClick={async () => {
                                        setMatchingFailed(false);
                                        const result = await startMatchmaking();
                                        if (result) {
                                            // マッチングタイマーを開始
                                            setMatchingTimerActive(true);
                                            setMatchingTimeLeft(30);

                                            if (result.type === 'tentative') {
                                                // 仮マッチング成功 - ready-matchを送信
                                                console.log('仮マッチング成功、ready-matchを送信');
                                                const readyResult = await readyMatch(
                                                    result.gameId,
                                                    result.opponentId!,
                                                    result.opponentName!
                                                );

                                                if (readyResult && readyResult.success) {
                                                    // ゲーム開始成功
                                                    console.log('ゲーム開始成功');
                                                    pusherRef.current = initializePusher(result.gameId);
                                                    setShowOnlineSetup(false);
                                                    setMatchingTimerActive(false);
                                                } else if (readyResult && readyResult.status === 'timeout') {
                                                    // タイムアウト
                                                    console.log('マッチングタイムアウト');
                                                    setMatchingFailed(true);
                                                    setMatchingTimerActive(false);
                                                }
                                            } else if (result.type === 'waiting') {
                                                // 待機中 - Pusherイベントを待つ
                                                console.log('待機中、Pusherイベントを待機');
                                            }
                                        }
                                    }}
                                    disabled={onlineGame.isSearching || !onlineGame.myPlayerName.trim()}
                                    className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded transition-colors"
                                >
                                    リトライ
                                </button>
                            )}

                            <button
                                onClick={() => {
                                    dispatch(setGameMode('pvp'));
                                    setShowOnlineSetup(false);
                                    setMatchingFailed(false);
                                    setMatchingTimerActive(false);
                                }}
                                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded transition-colors"
                            >
                                戻る
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }


    // ゲーム画面
    return (
        <div className="container mx-auto py-8">
            <div className="flex flex-col items-center justify-center p-8">
                {/* ゲームモードに応じたヘッダー */}
                <div className="mb-4 text-center">
                    {gameMode === 'online' && onlineGame.status === 'playing' && onlineGame.id && Object.keys(onlineGame.players).length > 0 ? (
                        <h2 className="text-2xl font-bold mb-2">
                            {(() => {
                                const playerEntries = Object.entries(onlineGame.players);
                                if (playerEntries.length >= 2) {
                                    const myPlayer = playerEntries.find(([id]) => id === onlineGame.myPlayerId);
                                    const opponent = playerEntries.find(([id]) => id !== onlineGame.myPlayerId);

                                    if (myPlayer && opponent) {
                                        const [, myPlayerData] = myPlayer;
                                        const [, opponentData] = opponent;
                                        return `${myPlayerData.name} VS ${opponentData.name}`;
                                    }
                                }
                                return 'オンライン対戦';
                            })()}
                        </h2>
                    ) : (
                        <h2 className="text-2xl font-bold mb-2">
                            {gameMode === 'cpu' ? 'CPU対戦' : 'オフライン対戦'}
                        </h2>
                    )}
                </div>




                {/* 回転ボタン */}
                <div className="flex items-center gap-24 mb-4">
                    <button
                        onClick={() => {
                            if (gameMode === 'online' && onlineGame.status === 'playing') {
                                // オンライン対戦の回転処理
                                if (isMyTurn()) {
                                    // WebSocket受信後にアニメーションが実行されるため、API呼び出しのみ
                                    console.log('回転API呼び出し: left');
                                    rotateBoardOnline('left');
                                }
                            } else {
                                // ローカル対戦の回転処理
                                animateRotation('left');
                            }
                        }}
                        className="p-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                        title="ボードを90度左回転"
                        disabled={animation.isRotating || animation.isDroppingStones}
                    >
                        <img src="/assets/images/game/icons/left-rotation.png" alt="左回転" className="w-8 h-8" />
                    </button>
                    <button
                        onClick={() => {
                            if (gameMode === 'online' && onlineGame.status === 'playing') {
                                // オンライン対戦の回転処理
                                if (isMyTurn()) {
                                    // WebSocket受信後にアニメーションが実行されるため、API呼び出しのみ
                                    console.log('回転API呼び出し: right');
                                    rotateBoardOnline('right');
                                }
                            } else {
                                // ローカル対戦の回転処理
                                animateRotation('right');
                            }
                        }}
                        className="p-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                        title="ボードを90度右回転"
                        disabled={animation.isRotating || animation.isDroppingStones}
                    >
                        <img src="/assets/images/game/icons/right-rotation.png" alt="右回転" className="w-8 h-8" />
                    </button>
                </div>

                {/* ゲームボード */}
                <div className="relative" style={{
                    width: 'fit-content',
                    height: 'fit-content',
                    minWidth: '500px',
                    minHeight: '500px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <div
                        className="grid grid-cols-7 gap-2 bg-blue-500 p-4 rounded-lg"
                        style={{
                            width: 'fit-content',
                            height: 'fit-content',
                            minWidth: '500px',
                            minHeight: '500px',
                            // 回転アニメーション中は回転を適用
                            transform: animation.isRotating ? `rotate(${animation.currentRotation}deg)` : 'rotate(0deg)',
                            transition: animation.isRotating ? 'transform 0.1s ease-out' : 'none',
                            transformOrigin: 'center center'
                        }}
                    >
                        {/* ゲームモードとアニメーション状態に応じてボードデータを選択 */}
                        {(gameMode === 'online' && onlineGame.status === 'playing' ?
                        (animation.isRotating && animation.rotatedBoard ? animation.rotatedBoard : onlineGame.board) :
                        (animation.isRotating && animation.rotatedBoard ? animation.rotatedBoard : displayBoard)).map((row, rowIndex) => (
                            row.map((cell, colIndex) => (
                                <div
                                    key={`${rowIndex}-${colIndex}`}
                                    className="bg-white rounded-full relative cursor-pointer"
                                    style={{
                                        width: '64px',
                                        height: '64px',
                                        minWidth: '64px',
                                        minHeight: '64px'
                                    }}
                                    onMouseEnter={() => {
                                        if (!animation.isRotating && !animation.isDroppingStones) {
                                            if (gameMode === 'online') {
                                                // オンライン対戦中は自分のターンの時のみホバー効果を有効
                                                if (isMyTurn()) {
                                                    setHoveredColumn(colIndex);
                                                }
                                            } else {
                                                // 通常のゲームモード
                                                setHoveredColumn(colIndex);
                                            }
                                        }
                                    }}
                                    onMouseLeave={() => {
                                        if (!animation.isRotating && !animation.isDroppingStones) {
                                            setHoveredColumn(null);
                                        }
                                    }}
                                    onClick={() => {
                                        if (gameMode === 'online' && onlineGame.status === 'playing') {
                                            // オンライン対戦のクリック処理
                                            if (isMyTurn()) {
                                                // 石の落下アニメーションを開始
                                                const emptyRow = getOnlineEmptyRow(colIndex);
                                                if (emptyRow !== -1) {
                                                    // アニメーション完了後にmakeMoveを実行
                                                    //animateStoneDrop(colIndex, emptyRow, getPlayerColor()).then(() => {
                                                        // オンラインの手を実行
                                                        makeMove(colIndex);
                                                    //});
                                                }
                                            }
                                        } else if ((gameMode === 'pvp' || currentPlayer === 'red') && !animation.isAnimating && !animation.isRotating && !animation.isDroppingStones) {
                                            // 通常のゲームのクリック処理
                                            handleColumnClick(colIndex);
                                        }
                                    }}
                                >
                                    {/* 石の表示 */}
                                    {shouldShowStone(rowIndex, colIndex, cell) && (
                                        <div
                                            className={`w-14 h-14 rounded-full ${getStoneColor(rowIndex, colIndex, cell)} absolute top-1 left-1`}
                                            style={{
                                                ...(getDroppingStonePosition(rowIndex, colIndex) || {}),
                                                zIndex: 10
                                            }}
                                        />
                                    )}

                                    {/* アニメーション中の石 */}
                                    {isAnimatingStone(rowIndex, colIndex) && animation.animatingStone && (
                                        <div
                                            className={`w-14 h-14 rounded-full ${animation.animatingStone.player === 'red' ? 'bg-red-500' : 'bg-yellow-500'} absolute top-1 left-1`}
                                            style={{
                                                ...getStoneAnimationStyle(rowIndex, colIndex),
                                                zIndex: 10
                                            }}
                                        />
                                    )}

                                    {/* オンライン対戦中の落下アニメーション中の石 */}
                                    {gameMode === 'online' && onlineGame.status === 'playing' && isAnimatingStone(rowIndex, colIndex) && animation.animatingStone && (
                                        <div
                                            className={`w-14 h-14 rounded-full ${animation.animatingStone.player === 'red' ? 'bg-red-500' : 'bg-yellow-500'} absolute top-1 left-1`}
                                            style={{
                                                ...getStoneAnimationStyle(rowIndex, colIndex),
                                                zIndex: 10
                                            }}
                                        />
                                    )}

                                    {/* ホバー時のプレビュー（オンライン対戦以外） */}
                                    {gameMode !== 'online' && hoveredColumn === colIndex && getEmptyRow(colIndex) === rowIndex && !animation.isAnimating && !animation.isRotating && !animation.isDroppingStones && (
                                        <div
                                            className={`w-14 h-14 rounded-full ${currentPlayer === 'red' ? 'bg-red-500/30' : 'bg-yellow-500/30'} border-2 border-dashed ${currentPlayer === 'red' ? 'border-red-500' : 'border-yellow-500'} absolute top-1 left-1`}
                                            style={{ zIndex: 10 }}
                                        />
                                    )}

                                    {/* オンライン対戦のプレビュー */}
                                    {gameMode === 'online' && onlineGame.status === 'playing' && getOnlineEmptyRow(colIndex) === rowIndex && isMyTurn() && hoveredColumn === colIndex && (
                                        <div
                                            className={`w-14 h-14 rounded-full ${getPlayerColor() === 'red' ? 'bg-red-500/30' : 'bg-yellow-500/30'} border-2 border-dashed ${getPlayerColor() === 'red' ? 'border-red-500' : 'border-yellow-500'} absolute top-1 left-1`}
                                            style={{ zIndex: 10 }}
                                        />
                                    )}
                                </div>
                            ))
                        ))}
                    </div>
                </div>

                {/* ゲームモードに応じたターン表示 */}
                <div className="mt-4 text-center">
                    <div className="text-xl font-bold">
                        {gameMode === 'online' && onlineGame.status === 'playing' ? (
                            isMyTurn() ? 'あなたのターン' : '相手のターン'
                        ) : gameMode === 'cpu' ? (
                            currentPlayer === 'red' ? 'あなたのターン' : 'CPUのターン'
                        ) : (
                            currentPlayer === 'red' ? 'プレイヤー1のターン' : 'プレイヤー2のターン'
                        )}
                    </div>

                    {/* オンライン対戦のタイマー表示 */}
                    {gameMode === 'online' && onlineGame.status === 'playing' && isMyTurn() && (
                        <div className="mt-2">
                            <div className="text-lg font-semibold text-gray-700">
                                残り時間: {timeLeft}秒
                            </div>
                            <div className="w-64 bg-gray-200 rounded-full h-2 mt-1 mx-auto">
                                <div
                                    className={`h-2 rounded-full transition-all duration-1000 ${
                                        timeLeft > 10 ? 'bg-green-500' :
                                        timeLeft > 5 ? 'bg-yellow-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${(timeLeft / 30) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}