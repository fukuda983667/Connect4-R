import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { redisCache } from '@/app/lib/redisCache';
import { cleanupOldWaitingPlayers, type WaitingPlayer } from '@/app/lib/gameUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { player_id, player_name = 'Player' } = body;

    if (!player_id) {
      return NextResponse.json(
        { success: false, message: 'player_idが必要です' },
        { status: 400 }
      );
    }

    // 古い待機プレイヤーをクリーンアップ
    const waitingPlayers = (await redisCache.get<WaitingPlayer[]>('waiting_players')) || [];
    const cleanedPlayers = cleanupOldWaitingPlayers(waitingPlayers);
    await redisCache.set('waiting_players', cleanedPlayers, 30);

    console.log('マッチング要求', {
      player_id,
      player_name,
      waiting_players_count: cleanedPlayers.length,
      waiting_players: cleanedPlayers
    });

    // 既に待機中のプレイヤーがいるかチェック
    if (cleanedPlayers.length > 0) {
      const opponent = cleanedPlayers.shift()!;
      // tentative状態になった時点で待機リストから除外
      await redisCache.set('waiting_players', cleanedPlayers, 30);

      // 相手のゲームIDを使用
      const gameId = opponent.game_id;

      console.log('仮マッチング成功', {
        game_id: gameId,
        player1: opponent,
        player2: { player_id, player_name }
      });

      return NextResponse.json({
        success: true,
        game_id: gameId,
        status: 'tentative',
        player_id,
        opponent_id: opponent.player_id,
        opponent_name: opponent.player_name
      });
    }

    // ゲームIDを生成（待機用）
    const gameId = uuidv4();

    // 待機リストに追加（game_idも含める）
    const newWaitingPlayer: WaitingPlayer = {
      player_id,
      player_name,
      game_id: gameId,
      joined_at: new Date().toISOString()
    };

    cleanedPlayers.push(newWaitingPlayer);
    await redisCache.set('waiting_players', cleanedPlayers, 30);

    console.log('プレイヤーを待機リストに追加', {
      player_id,
      player_name,
      game_id: gameId,
      total_waiting: cleanedPlayers.length
    });

    return NextResponse.json({
      success: true,
      game_id: gameId,
      player_id,
      status: 'waiting',
      message: 'マッチング中です...'
    });
  } catch (error) {
    console.error('findMatchでエラーが発生しました:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なエラー';

    // Redis接続エラーの場合、より詳細なメッセージを返す
    if (errorMessage.includes('Redis') || errorMessage.includes('ECONNREFUSED')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Redis接続エラーが発生しました。Redisサーバーが起動しているか確認してください。',
          error: errorMessage
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'サーバー内部エラーが発生しました',
        error: errorMessage
      },
      { status: 500 }
    );
  }
}






