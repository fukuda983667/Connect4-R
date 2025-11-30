import { NextRequest, NextResponse } from 'next/server';
import { redisCache } from '@/app/lib/redisCache';
import {
  getPlayerColor,
  getPlayerByColor,
  placeStone,
  checkWin,
  checkDraw,
  type Game
} from '@/app/lib/gameUtils';
import { broadcastGameEvent } from '@/app/lib/pusherServer';
import { recordPlayerWin } from '@/utils/supabase/ranking';

export async function POST(request: NextRequest) {
  try {
    console.log('[make-move] route invoked');
    const body = await request.json();
    const { game_id, player_id, column } = body;

    // 入力値の検証
    if (!game_id || !player_id || column === null || column === undefined) {
      return NextResponse.json(
        { success: false, message: '必要なパラメータが不足しています' },
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

    // 石を配置
    const row = placeStone(game.board, column, playerColor);
    if (row === -1) {
      return NextResponse.json(
        { success: false, message: 'その列には石を置けません' },
        { status: 400 }
      );
    }

    // ゲーム状態を更新
    game.board[row][column] = playerColor;
    game.current_player = currentPlayerColor === 'red' ? 'yellow' : 'red';

    // 勝利判定
    if (checkWin(game.board, row, column, playerColor)) {
      game.status = 'won';
      game.winner = playerColor;

      // 勝利したプレイヤーのランキングを更新
      const winnerPlayer = getPlayerByColor(game, playerColor);
      if (winnerPlayer) {
        console.log('[make-move] winner detected', winnerPlayer);
        await recordPlayerWin(winnerPlayer.name);
      }
    } else if (checkDraw(game.board)) {
      game.status = 'draw';
    }

    activeGames[game_id] = game;
    await redisCache.set('active_games', activeGames, 300);

    // 他のプレイヤーに手を通知
    await broadcastGameEvent.gameMove(game_id, game, column, row, playerColor, player_id, false);

    return NextResponse.json({
      success: true,
      game,
      move: {
        column,
        row,
        color: playerColor
      }
    });
  } catch (error) {
    console.error('makeMoveでエラーが発生しました:', error);
    return NextResponse.json(
      { success: false, message: 'サーバー内部エラーが発生しました' },
      { status: 500 }
    );
  }
}
