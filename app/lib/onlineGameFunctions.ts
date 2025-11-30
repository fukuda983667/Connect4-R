import { createPusherInstance, subscribeToGame } from './pusher';

export interface OnlinePlayer {
    id: string;
    name: string;
    color: 'red' | 'yellow';
}

export interface OnlineGameState {
    id: string | null;
    players: Record<string, OnlinePlayer>;
    board: (string | null)[][];
    currentPlayer: 'red' | 'yellow';
    status: 'waiting' | 'playing' | 'won' | 'draw';
    winner?: 'red' | 'yellow';
    myPlayerId: string | null;
    myPlayerName: string;
    isSearching: boolean;
    isConnected: boolean;
    error: string | null;
}

// プレイヤーIDを生成
export const generatePlayerId = (): string => {
    return Math.random().toString(36).substr(2, 9);
};

// マッチング開始
export const startMatchmaking = async (
    playerId: string,
    playerName: string
): Promise<{ success: boolean; gameId?: string; status?: string; message?: string; game?: any; opponentId?: string; opponentName?: string }> => {
    try {
        const response = await fetch('/api/game/find-match', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                player_id: playerId,
                player_name: playerName
            })
        });

        const data = await response.json();
        console.log('マッチング結果:', data); // デバッグ用

        if (data.success) {
            if (data.status === 'tentative') {
                console.log('仮マッチング成功:', data.game_id); // デバッグ用
                return {
                    success: true,
                    gameId: data.game_id,
                    status: 'tentative',
                    game: data.game,
                    opponentId: data.opponent_id,
                    opponentName: data.opponent_name
                };
            } else if (data.status === 'waiting') {
                console.log('マッチング待機中:', data.game_id); // デバッグ用
                return {
                    success: true,
                    gameId: data.game_id,
                    status: 'waiting',
                    message: 'マッチング中です...'
                };
            }
        } else {
            console.log('マッチングエラー:', data.message); // デバッグ用
            return { success: false, message: data.message || 'エラーが発生しました' };
        }
    } catch (err) {
        return { success: false, message: 'サーバーとの接続に失敗しました' };
    }
    return { success: false, message: '不明なエラーが発生しました' };
};

// マッチング準備完了
export const readyMatch = async (
    gameId: string,
    playerId: string,
    playerName: string,
    opponentId: string,
    opponentName: string
): Promise<{ success: boolean; status?: string; game?: any; message?: string }> => {
    try {
        const response = await fetch('/api/game/ready-match', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                game_id: gameId,
                player_id: playerId,
                player_name: playerName,
                opponent_id: opponentId,
                opponent_name: opponentName
            })
        });

        const data = await response.json();
        // console.log('ready-match結果:', data);

        if (data.success) {
            return {
                success: true,
                status: data.status,
                game: data.game
            };
        } else {
            return {
                success: false,
                status: data.status,
                message: data.message || 'エラーが発生しました'
            };
        }
    } catch (err) {
        return { success: false, message: 'サーバーとの接続に失敗しました' };
    }
};

// マッチング確認
export const confirmMatch = async (
    gameId: string,
    playerId: string
): Promise<{ success: boolean; message?: string }> => {
    try {
        const response = await fetch('/api/game/confirm-match', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                game_id: gameId,
                player_id: playerId
            })
        });

        const data = await response.json();
        // console.log('confirm-match結果:', data);

        return {
            success: data.success,
            message: data.message
        };
    } catch (err) {
        return { success: false, message: 'サーバーとの接続に失敗しました' };
    }
};

// 手を打つ
export const makeMove = async (
    gameId: string,
    playerId: string,
    column: number
): Promise<{ success: boolean; game?: any; message?: string }> => {
    try {
        const response = await fetch('/api/game/make-move', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                game_id: gameId,
                player_id: playerId,
                column: column
            })
        });

        const data = await response.json();

        if (data.success) {
            return { success: true, game: data.game };
        } else {
            return { success: false, message: data.message || 'エラーが発生しました' };
        }
    } catch (err) {
        return { success: false, message: 'サーバーとの接続に失敗しました' };
    }
};

// ゲームを離れる
export const leaveGame = async (gameId: string, playerId: string): Promise<boolean> => {
    try {
        await fetch('/api/game/leave', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                game_id: gameId,
                player_id: playerId
            })
        });
        return true;
    } catch (err) {
        console.error('ゲームを離れる際にエラーが発生しました');
        return false;
    }
};

// Pusher接続を初期化
export const initializePusherConnection = (
    gameId: string,
    onGameStart: (data: any) => void,
    onGameMove: (data: any) => void,
    onPlayerLeft: (data: any) => void
) => {
    const pusherInstance = createPusherInstance();
    const gameChannel = subscribeToGame(pusherInstance, gameId);

    gameChannel.bind('game.start', onGameStart);
    gameChannel.bind('game.move', onGameMove);
    gameChannel.bind('player.left', onPlayerLeft);

    return pusherInstance;
};

// プレイヤーの色を取得
export const getPlayerColor = (players: Record<string, OnlinePlayer>, myPlayerId: string): 'red' | 'yellow' => {
    for (const player of Object.values(players)) {
        if (player.id === myPlayerId) {
            return player.color;
        }
    }
    return 'red';
};

// 自分のターンかどうかを判定
export const isMyTurn = (currentPlayer: 'red' | 'yellow', myColor: 'red' | 'yellow'): boolean => {
    return currentPlayer === myColor;
};

// 空いている行を取得
export const getEmptyRow = (board: (string | null)[][], columnIndex: number): number => {
    for (let row = 6; row >= 0; row--) {
        if (board[row][columnIndex] === null) {
            return row;
        }
    }
    return -1;
};

// ボードを回転
export const rotateBoard = async (gameId: string, playerId: string, direction: 'left' | 'right'): Promise<{ success: boolean; game?: any; message?: string }> => {
    try {
        const response = await fetch('/api/game/rotate-board', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                game_id: gameId,
                player_id: playerId,
                direction: direction
            })
        });

        const data = await response.json();

        if (response.ok) {
            return { success: true, game: data.game };
        } else {
            return { success: false, message: data.message || 'エラーが発生しました' };
        }
    } catch (error) {
        console.error('ボード回転時にエラーが発生しました:', error);
        return { success: false, message: 'サーバーとの接続に失敗しました' };
    }
};
