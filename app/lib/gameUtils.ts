// ゲームロジックのユーティリティ関数

export interface Player {
  id: string;
  name: string;
  color: 'red' | 'yellow';
}

export interface Game {
  id: string;
  players: Record<string, Player>;
  board: (string | null)[][];
  current_player: 'red' | 'yellow';
  status: 'waiting' | 'tentative' | 'playing' | 'won' | 'draw';
  created_at: string;
  winner?: 'red' | 'yellow';
}

export interface WaitingPlayer {
  player_id: string;
  player_name: string;
  game_id: string;
  joined_at: string;
}

// 空のボードを作成
export function createEmptyBoard(): (string | null)[][] {
  const board: (string | null)[][] = [];
  for (let row = 0; row < 7; row++) {
    board[row] = [];
    for (let col = 0; col < 7; col++) {
      board[row][col] = null;
    }
  }
  return board;
}

// プレイヤーの色を取得
export function getPlayerColor(game: Game, playerId: string): 'red' | 'yellow' | null {
  const player = game.players[playerId];
  return player ? player.color : null;
}

// 色からプレイヤーを取得
export function getPlayerByColor(game: Game, color: 'red' | 'yellow'): Player | null {
  for (const player of Object.values(game.players)) {
    if (player.color === color) {
      return player;
    }
  }
  return null;
}

// 石を配置
export function placeStone(board: (string | null)[][], column: number, color: string): number {
  for (let row = 6; row >= 0; row--) {
    if (board[row][column] === null) {
      board[row][column] = color;
      return row;
    }
  }
  return -1;
}

// 勝利判定
export function checkWin(board: (string | null)[][], row: number, col: number, color: string): boolean {
  // 水平方向のチェック
  if (checkDirection(board, row, col, color, 0, 1)) return true;

  // 垂直方向のチェック
  if (checkDirection(board, row, col, color, 1, 0)) return true;

  // 対角線方向のチェック
  if (checkDirection(board, row, col, color, 1, 1)) return true;
  if (checkDirection(board, row, col, color, 1, -1)) return true;

  return false;
}

// 方向別の勝利判定
function checkDirection(
  board: (string | null)[][],
  row: number,
  col: number,
  color: string,
  dRow: number,
  dCol: number
): boolean {
  let count = 1;

  // 正方向にチェック
  for (let i = 1; i < 4; i++) {
    const newRow = row + (dRow * i);
    const newCol = col + (dCol * i);

    if (newRow < 0 || newRow >= 7 || newCol < 0 || newCol >= 7) break;
    if (board[newRow][newCol] !== color) break;

    count++;
  }

  // 負方向にチェック
  for (let i = 1; i < 4; i++) {
    const newRow = row - (dRow * i);
    const newCol = col - (dCol * i);

    if (newRow < 0 || newRow >= 7 || newCol < 0 || newCol >= 7) break;
    if (board[newRow][newCol] !== color) break;

    count++;
  }

  return count >= 4;
}

// 引き分け判定
export function checkDraw(board: (string | null)[][]): boolean {
  for (let col = 0; col < 7; col++) {
    if (board[0][col] === null) {
      return false;
    }
  }
  return true;
}

// ボードを回転
export function rotateBoardMatrix(board: (string | null)[][], direction: 'left' | 'right'): (string | null)[][] {
  const rows = board.length;
  const cols = board[0].length;
  const rotated: (string | null)[][] = [];

  if (direction === 'left') {
    // 左回転（90度反時計回り）
    for (let row = 0; row < rows; row++) {
      rotated[row] = [];
      for (let col = 0; col < cols; col++) {
        rotated[row][col] = board[col][rows - 1 - row];
      }
    }
  } else {
    // 右回転（90度時計回り）
    for (let row = 0; row < rows; row++) {
      rotated[row] = [];
      for (let col = 0; col < cols; col++) {
        rotated[row][col] = board[cols - 1 - col][row];
      }
    }
  }

  return rotated;
}

// 重力を適用
export function applyGravity(board: (string | null)[][]): (string | null)[][] {
  const rows = board.length;
  const cols = board[0].length;
  const result: (string | null)[][] = [];

  // 各行をコピー
  for (let row = 0; row < rows; row++) {
    result[row] = [];
    for (let col = 0; col < cols; col++) {
      result[row][col] = board[row][col];
    }
  }

  // 各列に対して重力を適用
  for (let col = 0; col < cols; col++) {
    const stones: (string | null)[] = [];

    // 下から上に向かって石を収集
    for (let row = rows - 1; row >= 0; row--) {
      if (result[row][col] !== null) {
        stones.push(result[row][col]);
      }
    }

    // 石を下から配置
    const stoneCount = stones.length;
    for (let row = rows - 1; row >= 0; row--) {
      if (row >= rows - stoneCount) {
        result[row][col] = stones[rows - 1 - row];
      } else {
        result[row][col] = null;
      }
    }
  }

  return result;
}

// 古い待機プレイヤーをクリーンアップ
export function cleanupOldWaitingPlayers(waitingPlayers: WaitingPlayer[]): WaitingPlayer[] {
  const currentTime = new Date();
  const cleanedPlayers: WaitingPlayer[] = [];

  for (const player of waitingPlayers) {
    const joinedTime = new Date(player.joined_at);
    const timeDiff = (currentTime.getTime() - joinedTime.getTime()) / 1000;

    // 30秒以内のプレイヤーのみ保持
    if (timeDiff < 30) {
      cleanedPlayers.push(player);
    }
  }

  return cleanedPlayers;
}
