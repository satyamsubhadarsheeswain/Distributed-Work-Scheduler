const { exec } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AntigravityScheduler {
  constructor() {
    this.nodes = new Map(); // workerId -> Node State
    this.taskQueue = []; // Priority queue (sorted)
    this.tasks = new Map(); // taskId -> Task Info
    this.history = []; // Rolling log of completed tasks
    this.simulatedWorkers = new Map(); // PID tracking
    this.telemetryHistory = new Map(); // workerId -> [last 5 samples]
    
    // Antigravity tuning parameters
    this.W_CPU = 0.6;
    this.W_RAM = 0.4;
    this.PREDICTION_WEIGHT = 1.5;
    
    // Chaos Engine state
    this.chaosMode = false;
    this.chaosInterval = null;

    setInterval(() => this.processQueue(), 200);
    setInterval(() => this.checkTimeouts(), 1000);
  }

  setChaosMode(enabled) {
    this.chaosMode = enabled;
    if (enabled && !this.chaosInterval) {
      this.chaosInterval = setInterval(() => {
        if (this.simulatedWorkers.size > 1) {
          console.log('[CHAOS ENGINE] Terminating a random node!');
          this.killSimulatedWorker('random');
        }
      }, 5000 + Math.random() * 5000); // Random kill every 5-10s
    } else if (!enabled && this.chaosInterval) {
      clearInterval(this.chaosInterval);
      this.chaosInterval = null;
    }
  }

  registerNode(workerId, socket, metrics) {
    this.nodes.set(workerId, {
      id: workerId,
      socket,
      metrics: metrics || { cpu: 0, ram: 0, runningTasks: 0 },
      mass: 0,
      projectedMass: 0,
      rank: 1.0, // Default performance score
      tasksCompleted: 0,
      tasksFailed: 0,
      totalExecutionTime: 0
    });
    this.telemetryHistory.set(workerId, []);
    this.updateNodeMetrics(workerId, metrics);
  }

  updateNodeMetrics(workerId, metrics) {
    const node = this.nodes.get(workerId);
    if (!node) return;
    
    node.metrics = metrics || node.metrics;
    
    const history = this.telemetryHistory.get(workerId) || [];
    history.push({ ...node.metrics, ts: Date.now() });
    if (history.length > 5) history.shift();
    this.telemetryHistory.set(workerId, history);

    const cpuFactor = typeof node.metrics.cpu === 'number' ? node.metrics.cpu : 0;
    const ramFactor = typeof node.metrics.ram === 'number' ? node.metrics.ram : 0;
    node.mass = (cpuFactor * this.W_CPU) + (ramFactor * this.W_RAM) + (node.metrics.runningTasks * 0.1);
    node.projectedMass = this.calculateProjectedMass(workerId, node.mass);
  }

  calculateProjectedMass(workerId, currentMass) {
    const history = this.telemetryHistory.get(workerId);
    if (!history || history.length < 2) return currentMass;

    const latest = history[history.length - 1];
    const previous = history[history.length - 2];
    const dt = (latest.ts - previous.ts) / 1000; 
    if (dt <= 0) return currentMass;

    const dCPU = (latest.cpu - previous.cpu) / dt;
    const dRAM = (latest.ram - previous.ram) / dt;
    const velocity = (dCPU * this.W_CPU) + (dRAM * this.W_RAM);
    
    const projection = Math.max(0, currentMass + (velocity * this.PREDICTION_WEIGHT));
    return parseFloat(projection.toFixed(3));
  }

  removeNode(workerId) {
    // If node had running tasks, they need to be failed/re-queued
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'RUNNING' && task.assignedTo === workerId) {
        console.log(`[FAULT] Node crashed. Task ${taskId} interrupted.`);
        this.failTask(taskId, 'NODE_DEAD');
      }
    }
    this.nodes.delete(workerId);
    this.telemetryHistory.delete(workerId);
  }

  enqueueTask(descriptor) {
    const taskId = uuidv4();
    const task = {
      id: taskId,
      ...descriptor,
      priority: descriptor.priority || 'NORMAL',
      status: 'QUEUED',
      createdAt: Date.now(),
      attempts: 0,
      timeout: descriptor.timeout || 10000 // default 10s timeout
    };
    
    this.tasks.set(taskId, task);
    this.pushToQueue(task);
  }

  pushToQueue(task) {
    this.taskQueue.push(task);
    const priorityMap = { 'URGENT': 0, 'HIGH': 1, 'NORMAL': 2 };
    this.taskQueue.sort((a, b) => priorityMap[a.priority] - priorityMap[b.priority]);
  }

  processQueue() {
    if (this.taskQueue.length === 0 || this.nodes.size === 0) return;

    const task = this.taskQueue.shift();
    
    let bestNode = null;
    let maxAttraction = -Infinity;

    for (const [workerId, node] of this.nodes.entries()) {
      // RANK-WEIGHTED Antigravity
      const effectiveMass = node.projectedMass;
      const attraction = node.rank / (effectiveMass + 0.05); 
      
      if (attraction > maxAttraction) {
        maxAttraction = attraction;
        bestNode = node;
      }
    }

    if (bestNode) {
      task.status = 'RUNNING';
      task.assignedTo = bestNode.id;
      task.startedAt = Date.now();
      task.attempts += 1;
      
      try {
        const payload = JSON.stringify({ type: 'EXECUTE', task }) + '\n';
        bestNode.socket.write(payload);
      } catch (e) {
        console.error('Failed to send task to node, re-queueing', e);
        task.status = 'QUEUED';
        this.pushToQueue(task);
      }
    } else {
      this.pushToQueue(task);
    }
  }

  checkTimeouts() {
    const now = Date.now();
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'RUNNING' && (now - task.startedAt) > task.timeout) {
        console.log(`[TIMEOUT] Task ${taskId} exceeded ${task.timeout}ms`);
        this.failTask(taskId, 'TIMEOUT');
      }
    }
  }

  resolveTask(taskId, result) {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'RUNNING') {
      task.status = 'COMPLETED';
      task.result = result;
      task.completedAt = Date.now();
      task.executionTime = task.completedAt - task.startedAt;
      this.addToHistory(task);

      // Update Node Rank
      const node = this.nodes.get(task.assignedTo);
      if (node) {
        node.tasksCompleted += 1;
        node.totalExecutionTime += task.executionTime;
        this.recalculateRank(node);
      }
    }
  }

  failTask(taskId, error) {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'RUNNING') {
      task.status = 'FAILED';
      task.error = error;
      task.completedAt = Date.now();
      this.addToHistory(task);

      // Penalize node if it's still alive
      const node = this.nodes.get(task.assignedTo);
      if (node) {
        node.tasksFailed += 1;
        this.recalculateRank(node);
      }

      // EXPONENTIAL BACKOFF RETRY
      if (task.attempts < 3) {
        const delay = 1000 * Math.pow(2, task.attempts - 1);
        console.log(`[RETRY] Delaying retry for task ${taskId} by ${delay}ms`);
        task.status = 'QUEUED_BACKOFF';
        setTimeout(() => {
          task.status = 'QUEUED';
          this.pushToQueue(task);
        }, delay);
      }
    }
  }

  recalculateRank(node) {
    const total = node.tasksCompleted + node.tasksFailed;
    if (total === 0) return;
    
    const successRate = node.tasksCompleted / total;
    // Simple heuristic: higher success rate -> higher rank. Defaults to 1.0
    // Avg exec time could be factored here too.
    node.rank = 0.5 + (successRate * 1.5);
  }

  addToHistory(task) {
    this.history.unshift(task);
    if (this.history.length > 50) this.history.pop();
  }

  getSystemState() {
    const cleanNodes = Array.from(this.nodes.values()).map(n => ({
      id: n.id,
      metrics: n.metrics,
      mass: n.mass,
      projectedMass: n.projectedMass,
      rank: n.rank
    }));

    const activeCount = Array.from(this.tasks.values()).filter(t => t.status === 'RUNNING').length;

    return {
      nodes: cleanNodes,
      tasks: Array.from(this.tasks.values()), 
      history: this.history,
      queueSize: this.taskQueue.length,
      activeCount: activeCount,
      chaosMode: this.chaosMode
    };
  }

  spawnSimulatedWorkers(count) {
    const workerPath = path.resolve(__dirname, '../../worker/src/client.js');
    for(let i=0; i < count; i++) {
        const proc = exec(`node "${workerPath}"`);
        this.simulatedWorkers.set(proc.pid, proc);
        proc.stdout.on('data', d => console.log(`[Worker ${proc.pid}] ${d.trim()}`));
        proc.stderr.on('data', d => console.error(`[Worker ${proc.pid} ERR] ${d.trim()}`));
        proc.on('exit', () => {
            this.simulatedWorkers.delete(proc.pid);
        });
    }
  }

  killSimulatedWorker(workerId) {
    if (this.simulatedWorkers.size > 0) {
        const pids = Array.from(this.simulatedWorkers.keys());
        // Pick random if workerId is 'random', else pick first
        const pidToKill = workerId === 'random' ? pids[Math.floor(Math.random() * pids.length)] : pids[0];
        const proc = this.simulatedWorkers.get(pidToKill);
        
        console.log(`Killing worker process ${pidToKill}`);
        if (process.platform === 'win32') {
            exec(`taskkill /F /T /PID ${pidToKill}`, (err) => {});
        } else {
            proc.kill('SIGTERM');
        }
        
        this.simulatedWorkers.delete(pidToKill);
    }
  }
}

module.exports = AntigravityScheduler;
