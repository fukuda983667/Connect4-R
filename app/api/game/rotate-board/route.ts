import { NextRequest, NextResponse } from 'next/server';
import { redisCache } from '@/app/lib/redisCache';
import { 
  getPlayerColor, 
  getPlayerByColor, 
  rotateBoardMatrix, 
  applyGravity, 
  checkWin, 
  checkDraw,
  type Game 
} from '@/app/lib/gameUtils';
import { broadcastGameEvent } from '@/app/lib/pusherServer';
import { recordPlayerWin } from '@/utils/supabase/ranking';

export async function POST(request: NextRequest) {
  try {
    console.log('[rotate-board] route invoked');
    const body = await request.json();
    const { game_id, player_id, direction } = body;

    if (!game_id || !player_id || !direction) {
      return NextResponse.json(
        { success: false, message: '必要なパラメータが不足しています' },
        { status: 400 }
      );
    }

    if (direction !== 'left' && direction !== 'right') {
      return NextResponse.json(
        { success: false, message: 'directionはleftまたはrightである必要があります' },
        { status: 400 }
      );
    }

    const activeGames = (await redisCache.get<Record<string, Game>>('active_games')) || {};

    if (!activeGames[game_id]) {
      return NextResponse.json(
        { success: false, message: 'ゲームが見つかりません' },
        { status: 404 }
      );
    }

    const game = activeGames[game_id];

    // プレイヤーの順番をチェック
    const currentPlayerColor = game.current_player;
    const playerColor = getPlayerColor(game, player_id);

    if (!playerColor || playerColor !== currentPlayerColor) {
      return NextResponse.json(
        { success: false, message: 'あなたのターンではありません' },
        { status: 400 }
      );
    }

    // ボードを回転
    const rotatedBoard = rotateBoardMatrix(game.board, direction);

    // 重力を適用して石を落下
    const settledBoard = applyGravity(rotatedBoard);

    // デバッグ用ログ
    console.log('ボード回転処理', {
      direction,
      original_board: game.board,
      rotated_board: rotatedBoard,
      settled_board: settledBoard
    });

    // ゲーム状態を更新
    game.board = settledBoard;

    // 回転後の盤面で勝利判定を実行
    let winner: 'red' | 'yellow' | null = null;
    let gameStatus: 'playing' | 'won' | 'draw' = 'playing';

    // 全セルをチェックして勝利判定
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 7; col++) {
        if (settledBoard[row][col] !== null) {
          if (checkWin(settledBoard, row, col, settledBoard[row][col]!)) {
            winner = settledBoard[row][col] as 'red' | 'yellow';
            gameStatus = 'won';
            break;
          }
        }
      }
      if (gameStatus === 'won') break;
    }

    // 引き分け判定（勝利がない場合）
    if (gameStatus !== 'won' && checkDraw(settledBoard)) {
      gameStatus = 'draw';
    }

    // ゲーム状態を更新
    game.status = gameStatus;
    if (winner) {
      game.winner = winner;

      // 勝利したプレイヤーのランキングを更新
      const winnerPlayer = getPlayerByColor(game, winner);
      if (winnerPlayer) {
        console.log('[rotate-board] winner detected', winnerPlayer);
        await recordPlayerWin(winnerPlayer.name);
      }
    }

    // 手番を交代（ゲームが終了していない場合のみ）
    if (gameStatus === 'playing') {
      game.current_player = currentPlayerColor === 'red' ? 'yellow' : 'red';
    }

    activeGames[game_id] = game;
    await redisCache.set('active_games', activeGames, 300);

    // 他のプレイヤーに回転を通知
    await broadcastGameEvent.gameMove(game_id, game, null, null, playerColor, player_id, true, direction);

    return NextResponse.json({
      success: true,
      game,
      move: {
        column: null,
        row: null,
        color: playerColor,
        playerId: player_id,
        rotated: true,
        direction
      }
    });
  } catch (error) {
    console.error('rotateBoardでエラーが発生しました:', error);
    return NextResponse.json(
      { success: false, message: 'サーバー内部エラーが発生しました' },
      { status: 500 }
    );
  }
}
