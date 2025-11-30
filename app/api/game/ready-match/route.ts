import { NextRequest, NextResponse } from 'next/server';
import { redisCache } from '@/app/lib/redisCache';
import { createEmptyBoard, type Game, type Player, type WaitingPlayer } from '@/app/lib/gameUtils';
import { broadcastGameEvent } from '@/app/lib/pusherServer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { game_id, player_id, player_name, opponent_id, opponent_name } = body;

    if (!game_id || !player_id || !player_name || !opponent_id || !opponent_name) {
      return NextResponse.json(
        { success: false, message: '必要なパラメータが不足しています' },
        { status: 400 }
      );
    }

    console.log('ready-match開始', {
      game_id,
      player_id,
      opponent_id
    });

    // 先攻後攻をランダムに決定
    const firstPlayer: Player = Math.random() < 0.5
      ? { id: opponent_id, name: opponent_name, color: 'red' }
      : { id: player_id, name: player_name, color: 'red' };

    const secondPlayer: Player = firstPlayer.id === opponent_id
      ? { id: player_id, name: player_name, color: 'yellow' }
      : { id: opponent_id, name: opponent_name, color: 'yellow' };

    // ゲーム状態を作成
    const game: Game = {
      id: game_id,
      players: {
        [firstPlayer.id]: firstPlayer,
        [secondPlayer.id]: secondPlayer
      },
      board: createEmptyBoard(),
      current_player: 'red',
      status: 'tentative',
      created_at: new Date().toISOString()
    };

    // 仮マッチング状態のゲームを保存
    const activeGames = (await redisCache.get<Record<string, Game>>('active_games')) || {};
    activeGames[game_id] = game;
    await redisCache.set('active_games', activeGames, 300);

    // 相手（waitingプレイヤー）に仮マッチング通知を送信
    await broadcastGameEvent.tentativeMatch(game_id, player_id, player_name);

    // 相手の応答を確認（5秒間、0.5秒ごとにチェック）
    // 相手は自分のplayer_idでconfirm-matchを送信する
    // 確認キーは相手のID（opponent_id）を使用する
    const confirmKey = `match_confirm_${game_id}_${opponent_id}`;
    let confirmed = false;
    const maxAttempts = 10; // 5秒間を0.5秒ごとにチェック

    console.log('相手の応答を待機開始', {
      game_id,
      opponent_id,
      player_id,
      cache_key: confirmKey,
      note: '相手はmatch_confirm_{game_id}_{opponent_id}でconfirmを送信するはず'
    });

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 500)); // 0.5秒待機
      confirmed = (await redisCache.get<boolean>(confirmKey)) || false;

    console.log(`相手の応答チェック (${i + 1}/${maxAttempts}):`, {
      confirmed,
      cache_key: confirmKey,
      cache_value: await redisCache.get(confirmKey),
      all_cache_keys: await redisCache.getAllKeys()
    });

      if (confirmed) {
        console.log('相手の応答確認成功', {
          game_id,
          opponent_id,
          attempt: i + 1,
          cache_key: confirmKey
        });
        break;
      }
    }

    if (!confirmed) {
      console.log('相手の応答確認失敗（タイムアウト）', {
        game_id,
        opponent_id,
        cache_key: confirmKey
      });
    }

    if (confirmed) {
      // 確認が取れたらゲーム開始
      game.status = 'playing';
      activeGames[game_id] = game;
      await redisCache.set('active_games', activeGames, 300);

      // 確認キャッシュを削除
      await redisCache.delete(confirmKey);

      // 両方のプレイヤーを待機リストから削除
      const waitingPlayers = (await redisCache.get<WaitingPlayer[]>('waiting_players')) || [];
      const updatedWaitingPlayers = waitingPlayers.filter(
        (p) => p.player_id !== player_id && p.player_id !== opponent_id
      );
      await redisCache.set('waiting_players', updatedWaitingPlayers, 30);

      // ゲーム開始イベントを発行
      await broadcastGameEvent.gameStart(game_id, game);

      console.log('マッチング確定、ゲーム開始', {
        game_id
      });

      return NextResponse.json({
        success: true,
        status: 'playing',
        game
      });
    } else {
      // 確認が取れなかった場合
      console.log('マッチング確認失敗', {
        game_id
      });

      // ゲームを削除
      delete activeGames[game_id];
      await redisCache.set('active_games', activeGames, 300);

      return NextResponse.json({
        success: false,
        status: 'timeout',
        message: '相手の応答がありませんでした'
      });
    }
  } catch (error) {
    console.error('readyMatchでエラーが発生しました:', error);
    return NextResponse.json(
      { success: false, message: 'サーバー内部エラーが発生しました' },
      { status: 500 }
    );
  }
}
