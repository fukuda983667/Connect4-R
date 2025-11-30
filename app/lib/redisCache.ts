// Redisキャッシュの実装（オンライン対戦用）
import { getRedisClient } from '@/utils/redis/client';

class RedisCache {
  // Redisキーにプレフィックスを付ける
    public getKey(key: string): string {
        return `game:${key}`;
    }

    public async set<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
        try {
            const client = await getRedisClient();
            const redisKey = this.getKey(key);
            const serializedValue = JSON.stringify(value);
            await client.setEx(redisKey, ttlSeconds, serializedValue);
        } catch (error) {
            console.error('Redis set error:', error);
            const errorMessage = error instanceof Error ? error.message : '不明なエラー';
            throw new Error(`Redisへの書き込みに失敗しました: ${errorMessage}`);
        }
    }

    public async get<T>(key: string): Promise<T | null> {
        try {
            const client = await getRedisClient();
            const redisKey = this.getKey(key);
            const serializedValue = await client.get(redisKey);
            if (!serializedValue) {
                return null;
            }
            return JSON.parse(serializedValue) as T;
        } catch (error) {
            console.error('Redis get error:', error);
            const errorMessage = error instanceof Error ? error.message : '不明なエラー';
            // 読み取りエラーの場合はnullを返す（フォールバック）
            console.warn(`Redisからの読み取りに失敗しました: ${errorMessage}`);
            return null;
        }
    }
    public async delete(key: string): Promise<boolean> {
        try {
            const client = await getRedisClient();
            const redisKey = this.getKey(key);
            const result = await client.del(redisKey);
            return result > 0;
        } catch (error) {
            console.error('Redis delete error:', error);
            return false;
        }
    }
    public async clear(): Promise<void> {
        try {
            const client = await getRedisClient();
            const keys = await client.keys('game:*');
            if (keys.length > 0) {
                await client.del(keys);
            }
        } catch (error) {
            console.error('Redis clear error:', error);
            throw error;
        }
    }

  // デバッグ用: 全てのキーを取得
    async getAllKeys(): Promise<string[]> {
        try {
            const client = await getRedisClient();
            const keys = await client.keys('game:*');
            return keys.map(key => key.replace('game:', ''));
        } catch (error) {
            console.error('Redis getAllKeys error:', error);
            return [];
        }
    }
}

// シングルトンインスタンス
export const redisCache = new RedisCache();

