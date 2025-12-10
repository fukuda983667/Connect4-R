import { createSlice, PayloadAction } from '@reduxjs/toolkit';

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
    status: 'waiting' | 'tentative' | 'playing' | 'won' | 'draw';
    winner?: 'red' | 'yellow';
    myPlayerId: string | null;
    myPlayerName: string;
    myPlayerColor: 'red' | 'yellow' | null; // 自分の色を追加
    isSearching: boolean;
    isConnected: boolean;
    error: string | null;
}

const initialState: OnlineGameState = {
    id: null,
    players: {},
    board: Array(7).fill(null).map(() => Array(7).fill(null)),
    currentPlayer: 'red',
    status: 'waiting',
    myPlayerId: null,
    myPlayerName: '',
    myPlayerColor: null, // 自分の色を初期化
    isSearching: false,
    isConnected: false,
    error: null,
};

const onlineGameSlice = createSlice({
    name: 'onlineGame',
    initialState,
    reducers: {
        setMyPlayerInfo: (state, action: PayloadAction<{ id: string; name: string }>) => {
            state.myPlayerId = action.payload.id;
            state.myPlayerName = action.payload.name;
        },
        updatePlayerName: (state, action: PayloadAction<string>) => {
            state.myPlayerName = action.payload;
        },
        startSearching: (state) => {
            state.isSearching = true;
            state.error = null;
        },
        stopSearching: (state) => {
            state.isSearching = false;
        },
        setWaitingState: (state, action: PayloadAction<{ id: string }>) => {
            state.id = action.payload.id;
            state.status = 'waiting';
            state.isSearching = false;
            state.isConnected = false; // Pusher接続をリセット
        },
        setGameState: (state, action: PayloadAction<{
            id: string;
            players: Record<string, OnlinePlayer>;
            board: (string | null)[][];
            currentPlayer: 'red' | 'yellow';
            status: 'tentative' | 'playing' | 'won' | 'draw';
            winner?: 'red' | 'yellow';
        }>) => {
            state.id = action.payload.id;
            state.players = action.payload.players;
            state.board = action.payload.board;
            state.currentPlayer = action.payload.currentPlayer;
            state.status = action.payload.status;
            state.winner = action.payload.winner;
            state.isSearching = false;
            state.error = null;

            // 自分の色を設定
            if (state.myPlayerId && action.payload.players[state.myPlayerId]) {
                state.myPlayerColor = action.payload.players[state.myPlayerId].color;
            }
        },
        updateBoard: (state, action: PayloadAction<{
            board: (string | null)[][];
            currentPlayer: 'red' | 'yellow';
            status: 'playing' | 'won' | 'draw';
            winner?: 'red' | 'yellow';
        }>) => {
            state.board = action.payload.board;
            state.currentPlayer = action.payload.currentPlayer;
            state.status = action.payload.status;
            state.winner = action.payload.winner;
        },
        setConnected: (state, action: PayloadAction<boolean>) => {
            state.isConnected = action.payload;
        },
        setError: (state, action: PayloadAction<string>) => {
            state.error = action.payload;
            state.isSearching = false;
        },
        clearError: (state) => {
            state.error = null;
        },
        resetGame: (state) => {
            state.id = null;
            state.players = {};
            state.board = Array(7).fill(null).map(() => Array(7).fill(null));
            state.currentPlayer = 'red';
            state.status = 'waiting';
            state.winner = undefined;
            state.myPlayerColor = null;
            state.isSearching = false;
            state.error = null;
        },
        resetOnlineGameState: (state) => {
            // すべての状態をリセット（myPlayerNameは保持）
            state.id = null;
            state.players = {};
            state.board = Array(7).fill(null).map(() => Array(7).fill(null));
            state.currentPlayer = 'red';
            state.status = 'waiting';
            state.winner = undefined;
            state.myPlayerId = null;
            state.myPlayerColor = null;
            state.isSearching = false;
            state.isConnected = false;
            state.error = null;
        },
        playerLeft: (state) => {
            state.status = 'waiting';
            state.error = '相手がゲームを離れました';
        },
    },
});

export const {
    setMyPlayerInfo,
    updatePlayerName,
    startSearching,
    stopSearching,
    setWaitingState,
    setGameState,
    updateBoard,
    setConnected,
    setError,
    clearError,
    resetGame,
    resetOnlineGameState,
    playerLeft,
} = onlineGameSlice.actions;

export default onlineGameSlice.reducer;
