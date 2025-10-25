import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { loggerUtils } from '../utils/logger.js';

/**
 * Media Cache Cleanup Job
 * 
 * This job runs every 30 minutes to clean up media files that are older than 1 hour.
 * Files are stored in temp/media-cache/trigger_{connectionId}/ directories.
 */

const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds
const MEDIA_CACHE_DIR = path.join(process.cwd(), 'temp', 'media-cache');

/**
 * Clean up old media files from trigger directories
 */
async function cleanupOldMediaFiles() {
  try {
    if (!fs.existsSync(MEDIA_CACHE_DIR)) {
      loggerUtils.info('Media cache directory does not exist, skipping cleanup');
      return;
    }

    const now = Date.now();
    let totalFilesDeleted = 0;
    let totalSizeDeleted = 0;

    // Get all trigger directories
    const triggerDirs = fs.readdirSync(MEDIA_CACHE_DIR).filter(dir => {
      const dirPath = path.join(MEDIA_CACHE_DIR, dir);
      return dir.startsWith('trigger_') && fs.statSync(dirPath).isDirectory();
    });

    loggerUtils.info('Starting media cache cleanup', {
      triggerDirsCount: triggerDirs.length
    });

    for (const triggerDir of triggerDirs) {
      const triggerDirPath = path.join(MEDIA_CACHE_DIR, triggerDir);
      
      try {
        const files = fs.readdirSync(triggerDirPath);
        let filesDeletedInDir = 0;
        let sizeDeletedInDir = 0;

        for (const file of files) {
          const filePath = path.join(triggerDirPath, file);
          
          try {
            const stats = fs.statSync(filePath);
            
            // Check if file is older than 1 hour
            if (now - stats.mtime.getTime() > ONE_HOUR) {
              const fileSize = stats.size;
              
              // Delete the file
              fs.unlinkSync(filePath);
              
              filesDeletedInDir++;
              sizeDeletedInDir += fileSize;
              totalFilesDeleted++;
              totalSizeDeleted += fileSize;
              
              loggerUtils.debug('Deleted old media file', {
                file,
                age: Math.round((now - stats.mtime.getTime()) / (1000 * 60)), // age in minutes
                size: fileSize
              });
            }
          } catch (fileError) {
            loggerUtils.error('Error processing file during cleanup', {
              file,
              error: fileError.message
            });
          }
        }

        // If directory is empty after cleanup, remove it
        if (filesDeletedInDir > 0) {
          const remainingFiles = fs.readdirSync(triggerDirPath);
          if (remainingFiles.length === 0) {
            fs.rmdirSync(triggerDirPath);
            loggerUtils.info('Removed empty trigger directory', {
              directory: triggerDir
            });
          }
        }

        if (filesDeletedInDir > 0) {
          loggerUtils.info('Cleanup completed for trigger directory', {
            triggerDir,
            filesDeleted: filesDeletedInDir,
            sizeDeleted: `${(sizeDeletedInDir / 1024).toFixed(2)} KB`
          });
        }

      } catch (dirError) {
        loggerUtils.error('Error processing trigger directory during cleanup', {
          triggerDir,
          error: dirError.message
        });
      }
    }

    if (totalFilesDeleted > 0) {
      loggerUtils.info('Media cache cleanup completed', {
        totalFilesDeleted,
        totalSizeDeleted: `${(totalSizeDeleted / 1024).toFixed(2)} KB`
      });
    } else {
      loggerUtils.info('No old media files found for cleanup');
    }

  } catch (error) {
    loggerUtils.error('Error during media cache cleanup', {
      error: error.message
    });
  }
}

/**
 * Initialize the cleanup job
 */
function initializeMediaCleanup() {
  try {
    // Run cleanup every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
      loggerUtils.info('Starting scheduled media cache cleanup');
      await cleanupOldMediaFiles();
    });

    // Run initial cleanup on startup (after 1 minute delay)
    setTimeout(async () => {
      loggerUtils.info('Running initial media cache cleanup');
      await cleanupOldMediaFiles();
    }, 60000); // 1 minute delay

    loggerUtils.info('Media cache cleanup job initialized', {
      schedule: 'Every 30 minutes',
      ttl: '1 hour'
    });

  } catch (error) {
    loggerUtils.error('Failed to initialize media cleanup job', {
      error: error.message
    });
  }
}

export { cleanupOldMediaFiles, initializeMediaCleanup };
