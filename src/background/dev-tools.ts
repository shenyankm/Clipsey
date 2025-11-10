import { indexedDBManager } from './indexeddb';
import { IndexedDBQuery } from './indexeddb-query';
import { getStorageStats } from './storage';
import type { Clip } from '@/types/clip';

// 开发工具：提供调试与测试辅助
export class DevTools {
  // 在控制台暴露 ClipseyDevTools（开发调试用）
  static exposeToConsole(): void {
    if (typeof window !== 'undefined') {
      (window as any).ClipseyDevTools = {
        // 数据库操作
        db: {
          init: () => indexedDBManager.init(),
          clear: () => indexedDBManager.clear('clips'),
          count: () => indexedDBManager.count('clips'),
          getAll: () => IndexedDBQuery.getAll('clips'),
          stats: () => getStorageStats(),
          delete: () => indexedDBManager.deleteDatabase(),
          reset: () => DevTools.resetAllData()
        },
        
        // 数据生成
        generate: {
          testClips: (count: number) => this.generateTestClips(count),
          bulkClips: (count: number) => this.generateBulkTestData(count)
        },
        
        // 调试信息
        debug: {
          info: () => this.getDebugInfo(),
          performance: () => this.measurePerformance(),
          storage: () => this.analyzeStorage()
        }
      };
      
      console.log('🛠️ Clipsey Dev Tools loaded! Use ClipseyDevTools in console.');
      console.log('Available commands:');
      console.log('  ClipseyDevTools.db.* - Database operations');
      console.log('  ClipseyDevTools.generate.* - Data generation');
      console.log('  ClipseyDevTools.debug.* - Debug information');
    }
  }

  // 生成测试 Clips 数据
  static async generateTestClips(count: number): Promise<Clip[]> {
    const clips: Clip[] = [];
    const domains = ['example.com', 'test.org', 'demo.net', 'sample.io'];
    const contentTypes = ['article', 'code', 'quote', 'note'];
    
    for (let i = 0; i < count; i++) {
      const domain = domains[i % domains.length];
      const contentType = contentTypes[i % contentTypes.length];
      const timestamp = new Date(Date.now() - i * 60000).toISOString();
      
      clips.push({
        id: `test-${i}-${Date.now()}`,
        sourceUrl: `https://${domain}/page${i}`,
        textContent: `Test ${contentType} content ${i}. This is sample text for testing purposes.`,
        title: `Test ${contentType} ${i}`,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
    
    return clips;
  }

  // 生成大量测试数据（分批写入）
  static async generateBulkTestData(count: number): Promise<void> {
    console.log(`🔄 Generating ${count} test clips...`);
    
    const clips = await this.generateTestClips(count);
    const batchSize = 50;
    
    for (let i = 0; i < clips.length; i += batchSize) {
      const batch = clips.slice(i, i + batchSize);
      await IndexedDBQuery.bulkAdd('clips', batch);
      console.log(`📦 Added batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(clips.length / batchSize)}`);
    }
    
    console.log(`✅ Generated ${count} test clips successfully`);
  }

  // 获取调试信息快照
  static async getDebugInfo(): Promise<object> {
    try {
      const stats = await getStorageStats();
      
      return {
        timestamp: new Date().toISOString(),
        indexedDB: {
          initialized: indexedDBManager.isInitialized(),
          stats
        },
        browser: {
          userAgent: navigator.userAgent,
          indexedDBSupported: 'indexedDB' in window,
          chromeStorageSupported: typeof chrome !== 'undefined' && !!chrome.storage
        }
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  // 简单性能测量：写入/读取/索引查询/计数
  static async measurePerformance(): Promise<object> {
    console.log('📊 Measuring performance...');
    
    const results: any = {};
    
    try {
      // 测试写入性能
      const writeStart = performance.now();
      const testClip: Clip = {
        id: `perf-test-${Date.now()}`,
        sourceUrl: 'https://performance.test',
        textContent: 'Performance test content',
        createdAt: new Date().toISOString()
      };
      await indexedDBManager.add('clips', testClip);
      results.writeTime = performance.now() - writeStart;
      
      // 测试读取性能
      const readStart = performance.now();
      await IndexedDBQuery.getAll('clips');
      results.readAllTime = performance.now() - readStart;
      
      // 测试索引查询性能
      const queryStart = performance.now();
      await IndexedDBQuery.getByIndex('clips', 'sourceUrl', 'https://performance.test');
      results.indexQueryTime = performance.now() - queryStart;
      
      // 测试计数性能
      const countStart = performance.now();
      await indexedDBManager.count('clips');
      results.countTime = performance.now() - countStart;
      
      // 清理测试数据
      await indexedDBManager.delete('clips', testClip.id);
      
    } catch (error) {
      results.error = error instanceof Error ? error.message : 'Unknown error';
    }
    
    console.log('📊 Performance results:', results);
    return results;
  }

  // 存储分析：URL/域名分布与内容长度统计
  static async analyzeStorage(): Promise<object> {
    try {
      const stats = await getStorageStats();
      const allClips = await IndexedDBQuery.getAll('clips');
      
      // 分析URL分布
      const urlDistribution: Record<string, number> = {};
      const domainDistribution: Record<string, number> = {};
      
      allClips.forEach(clip => {
        if (clip.sourceUrl) {
          urlDistribution[clip.sourceUrl] = (urlDistribution[clip.sourceUrl] || 0) + 1;
          
          try {
            const domain = new URL(clip.sourceUrl).hostname;
            domainDistribution[domain] = (domainDistribution[domain] || 0) + 1;
          } catch {
            // 忽略无效URL
          }
        }
      });
      
      // 分析内容长度分布
      const contentLengths = allClips.map(clip => clip.textContent?.length || 0);
      const avgContentLength = contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length;
      
      return {
        stats,
        distribution: {
          urls: Object.keys(urlDistribution).length,
          domains: Object.keys(domainDistribution).length,
          topDomains: Object.entries(domainDistribution)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
        },
        content: {
          averageLength: Math.round(avgContentLength),
          minLength: Math.min(...contentLengths),
          maxLength: Math.max(...contentLengths)
        }
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // 重置所有数据（清空 clips/settings/metadata）
  static async resetAllData(): Promise<void> {
    console.log('🗑️ Resetting all data...');
    
    try {
      await indexedDBManager.clear('clips');
      await indexedDBManager.clear('settings');
      await indexedDBManager.clear('metadata');
      
      console.log('✅ All data reset successfully');
    } catch (error) {
      console.error('❌ Failed to reset data:', error);
      throw error;
    }
  }
}

// 在开发环境中自动暴露工具
if (import.meta.env.DEV || typeof window !== 'undefined') {
  DevTools.exposeToConsole();
}
