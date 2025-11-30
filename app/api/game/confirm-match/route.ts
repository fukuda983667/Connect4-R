import { NextRequest, NextResponse } from 'next/server';
import { redisCache } from '@/app/lib/redisCache';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('confirm-matchリクエストボディ:', body);

    const { game_id, player_id } = body;

    if (!game_id || !player_id) {
      console.error('必要なパラメータが不足しています:', { game_id, player_id });
      return NextResponse.json(
        { success: false, message: 'game_idとplayer_idが必要です' },
        { status: 400 }
      );
    }

    // キャッシュに確認を保存（10秒間）
    const confirmKey = `match_confirm_${game_id}_${player_id}`;
    await redisCache.set(confirmKey, true, 10);

    console.log('confirm-match受信', {
      game_id,
      player_id,
      cache_key: confirmKey,
      cache_saved: await redisCache.get(confirmKey),
      cache_set_success: true
    });

    return NextResponse.json({
      success: true,
      message: 'マッチングを確認しました'
    });
  } catch (error) {
    console.error('confirmMatchでエラーが発生しました:', error);
    return NextResponse.json(
      { success: false, message: 'サーバー内部エラーが発生しました' },
      { status: 500 }
    );
  }
}

