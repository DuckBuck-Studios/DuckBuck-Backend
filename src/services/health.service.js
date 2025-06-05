const os = require('os');
const admin = require('firebase-admin');
const logger = require('../utils/logger');
const checkDiskSpace = require('check-disk-space').default;
const { networkInterfaces } = require('os');
const { SECURITY_CONFIG } = require('../config/constants');

/**
 * Comprehensive health check service
 * Provides detailed system health metrics for monitoring and diagnostics
 */
class HealthService {
  /**
   * Get complete system health information
   * @returns {Object} System health status
   */
  async getSystemHealth() {
    const startTime = Date.now();

    try {
      // Run all health checks in parallel for efficiency
      const [
        systemInfo,
        nodeInfo,
        dbStatus,
        firebaseStatus,
        resourceUsage,
        cloudInfo
      ] = await Promise.all([
        this.getSystemInfo(),
        this.getNodeInfo(),
        this.checkDatabaseHealth(),
        this.checkFirebaseHealth(),
        this.getResourceUsage(),
        this.getCloudEnvironmentInfo()
      ]);

      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Include disk health in the overall health status
      const diskHealth = resourceUsage.disk.healthy !== false;
      
      return {
        status: this.determineOverallStatus([dbStatus, firebaseStatus, {healthy: diskHealth}]),
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        environment: process.env.NODE_ENV || 'development',
        system: systemInfo,
        node: nodeInfo,
        database: dbStatus,
        firebase: firebaseStatus,
        resources: resourceUsage,
        cloud: cloudInfo
      };
    } catch (error) {
      logger.error('Error generating health report:', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: process.env.NODE_ENV === 'production' 
          ? 'Error generating health report' 
          : error.message
      };
    }
  }

  /**
   * Get basic system information
   * @returns {Object} System information
   */
  async getSystemInfo() {
    return {
      platform: process.platform,
      architecture: process.arch,
      hostname: os.hostname(),
      cpus: os.cpus().length,
      uptime: {
        system: Math.floor(os.uptime()),
        process: Math.floor(process.uptime())
      },
      loadAverage: os.loadavg()
    };
  }

  /**
   * Get Node.js runtime information
   * @returns {Object} Node.js information
   */
  async getNodeInfo() {
    return {
      version: process.version,
      versions: process.versions,
      memoryUsage: {
        rss: this.formatBytes(process.memoryUsage().rss),
        heapTotal: this.formatBytes(process.memoryUsage().heapTotal),
        heapUsed: this.formatBytes(process.memoryUsage().heapUsed),
        external: this.formatBytes(process.memoryUsage().external),
        arrayBuffers: this.formatBytes(process.memoryUsage().arrayBuffers || 0)
      },
      pid: process.pid,
      env: {
        nodeEnv: process.env.NODE_ENV || 'development'
      }
    };
  }

  /**
   * Check Firestore database health (replacing MongoDB)
   * @returns {Object} Database health status
   */
  async checkDatabaseHealth() {
    try {
      // Check if Firebase is initialized (which includes Firestore)
      const isInitialized = admin.apps.length > 0;
      
      if (!isInitialized) {
        return {
          status: 'not_initialized',
          healthy: false,
          type: 'firestore'
        };
      }

      // Test Firestore connectivity with a simple operation
      try {
        const db = admin.firestore();
        // Try to get a dummy document reference (doesn't need to exist)
        const testRef = db.collection('_health_check').doc('test');
        await testRef.get(); // This will test connectivity even if doc doesn't exist
        
        return {
          status: 'connected',
          healthy: true,
          type: 'firestore',
          name: 'firestore'
        };
      } catch (error) {
        return {
          status: 'connection_failed',
          healthy: false,
          type: 'firestore',
          error: process.env.NODE_ENV === 'production' ? 
            'Firestore connection failed' : error.message
        };
      }
    } catch (error) {
      logger.error('Database health check failed:', error);
      return {
        status: 'error',
        healthy: false,
        type: 'firestore',
        error: process.env.NODE_ENV === 'production' ? 
          'Database health check failed' : error.message
      };
    }
  }

  /**
   * Check Firebase Admin SDK health
   * @returns {Object} Firebase health status
   */
  async checkFirebaseHealth() {
    try {
      // Check if Firebase is initialized
      const isInitialized = admin.apps.length > 0;
      
      if (!isInitialized) {
        return {
          status: 'not_initialized',
          healthy: false
        };
      }
      
      // Attempt a simple operation to verify Firebase is working
      try {
        // This is a lightweight operation just to test connectivity
        await admin.app().options;
        
        return {
          status: 'connected',
          healthy: true,
          projectId: admin.app().options.projectId || 'unknown',
          serviceAccountEmail: admin.app().options.credential?.serviceAccountEmail || 'unknown',
          appName: admin.app().name || 'default'
        };
      } catch (error) {
        logger.error('Firebase health check failed:', error);
        return {
          status: 'error',
          healthy: false,
          error: process.env.NODE_ENV === 'production' ? 
            'Firebase operation failed' : error.message
        };
      }
    } catch (error) {
      logger.error('Firebase health check failed:', error);
      return {
        status: 'error',
        healthy: false,
        error: process.env.NODE_ENV === 'production' ? 
          'Firebase health check failed' : error.message
      };
    }
  }

  /**
   * Get system resource usage
   * @returns {Object} Resource usage information
   */
  async getResourceUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // Get memory usage as a percentage
    const memoryPercentage = Math.round((usedMem / totalMem) * 100);
    
    // Determine memory health
    let memoryStatus = 'healthy';
    let memoryWarning = null;
    
    if (memoryPercentage > 90) {
      memoryStatus = 'critical';
      memoryWarning = 'Memory usage exceeds 90%';
    } else if (memoryPercentage > 80) {
      memoryStatus = 'warning';
      memoryWarning = 'Memory usage exceeds 80%';
    }
    
    // Get CPU usage percentage
    const cpuLoadPercentage = this.getCpuLoadPercentage();
    
    // Determine CPU health
    let cpuStatus = 'healthy';
    let cpuWarning = null;
    
    if (cpuLoadPercentage > 90) {
      cpuStatus = 'critical';
      cpuWarning = 'CPU usage exceeds 90%';
    } else if (cpuLoadPercentage > 80) {
      cpuStatus = 'warning';
      cpuWarning = 'CPU usage exceeds 80%';
    }
    
    // Get disk space information
    const diskInfo = await this.checkDiskSpace();
    
    return {
      memory: {
        status: memoryStatus,
        warning: memoryWarning,
        total: this.formatBytes(totalMem),
        free: this.formatBytes(freeMem),
        used: this.formatBytes(usedMem),
        usedPercentage: memoryPercentage,
        healthy: memoryStatus === 'healthy'
      },
      cpu: {
        status: cpuStatus,
        warning: cpuWarning,
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || 'Unknown',
        loadPercentage: cpuLoadPercentage,
        healthy: cpuStatus === 'healthy'
      },
      disk: diskInfo
    };
  }

  /**
   * Format bytes into human-readable format
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Calculate CPU load percentage
   * @returns {number} CPU load percentage
   */
  getCpuLoadPercentage() {
    try {
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;

      // Sum up CPU times across all cores
      for (const cpu of cpus) {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      }

      // Calculate CPU usage percentage
      const idle = totalIdle / cpus.length;
      const total = totalTick / cpus.length;
      const usagePercent = Math.round((1 - idle / total) * 100);
      
      return usagePercent;
    } catch (error) {
      logger.error('Error calculating CPU load:', error);
      return -1;
    }
  }

  /**
   * Check disk space using check-disk-space library
   * @returns {Object} Disk space information
   */
  async checkDiskSpace() {
    try {
      // Get application root directory (where the app is running)
      const rootDir = process.cwd();
      
      // Get disk space information for the root directory
      const diskSpace = await checkDiskSpace(rootDir);
      
      const totalBytes = diskSpace.size;
      const freeBytes = diskSpace.free;
      const usedBytes = totalBytes - freeBytes;
      const usedPercentage = Math.round((usedBytes / totalBytes) * 100);
      
      // Set disk status based on capacity
      let status = 'healthy';
      let warning = null;
      
      if (usedPercentage > 90) {
        status = 'critical';
        warning = 'Disk usage exceeds 90%, consider freeing up space';
      } else if (usedPercentage > 80) {
        status = 'warning';
        warning = 'Disk usage exceeds 80%';
      }
      
      return {
        status,
        warning,
        diskPath: diskSpace.diskPath,
        total: this.formatBytes(totalBytes),
        free: this.formatBytes(freeBytes),
        used: this.formatBytes(usedBytes),
        usedPercentage,
        healthy: status === 'healthy'
      };
    } catch (error) {
      logger.error('Error checking disk space:', error);
      return { 
        status: 'error', 
        error: process.env.NODE_ENV === 'production' ? 
          'Failed to check disk space' : error.message,
        healthy: false
      };
    }
  }

  /**
   * Get cloud environment information
   * @returns {Object} Cloud environment information
   */
  async getCloudEnvironmentInfo() {
    try {
      const cloudInfo = {
        provider: 'unknown',
        region: 'unknown',
        instance: 'unknown'
      };
      
      // Detect Google Cloud Run
      if (process.env.K_SERVICE) {
        cloudInfo.provider = 'Google Cloud Run';
        cloudInfo.service = process.env.K_SERVICE;
        cloudInfo.revision = process.env.K_REVISION;
        cloudInfo.configuration = process.env.K_CONFIGURATION;
        
        // Check for container limits
        const cpuLimit = process.env.CPU || 'unknown';
        const memoryLimit = process.env.MEMORY_LIMIT || 'unknown';
        
        cloudInfo.limits = {
          cpu: cpuLimit,
          memory: memoryLimit
        };
        
        // Get instance ID (for requests served by same instance)
        cloudInfo.instance = process.env.K_REVISION || os.hostname();
        
        // Get network interfaces for cloud environment
        cloudInfo.network = this.getNetworkInfo();
        
        // Check if request timeout is configured appropriately for Cloud Run
        const requestTimeout = SECURITY_CONFIG.REQUEST_TIMEOUT_MS;
        cloudInfo.timeoutConfig = {
          requestTimeoutMs: requestTimeout,
          optimal: requestTimeout <= 60000,
          recommendation: requestTimeout > 60000 ? 'Reduce timeout to 60s or less for Cloud Run' : 'Good'
        };
      }
      
      return cloudInfo;
    } catch (error) {
      logger.error('Error detecting cloud environment:', error);
      return { 
        provider: 'unknown', 
        error: process.env.NODE_ENV === 'production' ? 
          'Error detecting cloud environment' : error.message 
      };
    }
  }
  
  /**
   * Get network interface information
   * @returns {Object} Network interfaces information
   */
  getNetworkInfo() {
    try {
      const interfaces = networkInterfaces();
      const networkInfo = {};
      
      // List all network interfaces
      Object.keys(interfaces).forEach(ifaceName => {
        const iface = interfaces[ifaceName];
        // Filter out internal interfaces if needed
        networkInfo[ifaceName] = iface.map(details => ({
          address: details.address,
          family: details.family,
          internal: details.internal
        }));
      });
      
      return networkInfo;
    } catch (error) {
      return { error: 'Failed to get network interfaces' };
    }
  }

  /**
   * Determine overall system health status
   * @param {Array<Object>} checks - Array of health check results
   * @returns {string} Overall status
   */
  determineOverallStatus(checks) {
    // If any critical checks are unhealthy, system is unhealthy
    if (checks.some(check => check.healthy === false)) {
      return 'unhealthy';
    }
    
    // If all checks were successful, system is healthy
    return 'healthy';
  }
}

module.exports = new HealthService();
