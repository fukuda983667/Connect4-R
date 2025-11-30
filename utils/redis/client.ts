import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let isConnecting = false;

export async function getRedisClient(): Promise<RedisClientType> {
    if (!redisClient && !isConnecting) {
    // サーバーサイドでは両方の環境変数をサポート
        const redisUrl = process.env.REDIS_URL || process.env.NEXT_PUBLIC_REDIS_URL;
        if (!redisUrl) {
            throw new Error('REDIS_URLまたはNEXT_PUBLIC_REDIS_URL環境変数が設定されていません');
        }

        isConnecting = true;
        try {
            redisClient = createClient({ url: redisUrl });

      // エラーハンドラーを設定
            redisClient.on('error', (err) => {
                console.error('Redisクライアントエラー:', err);
            });

            await redisClient.connect();
            isConnecting = false;
        } catch (error) {
            isConnecting = false;
            redisClient = null;
            throw new Error(`Redis接続に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
        }
    } else if (isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return getRedisClient();
    }

    if (!redisClient) {
        throw new Error('Redisクライアントの初期化に失敗しました');
    }

    return redisClient;
}