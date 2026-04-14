const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// A simple thread pool executor wrapper.
// In a highly robust environment we'd use a robust thread pool library
// but for our Simulation/Antigravity demo, instantiating a worker thread 
// per task is sufficient to simulate multi-core distributed workloads.

class Executor {
  constructor(workerClient) {
    this.workerClient = workerClient;
  }

  runTask(task) {
    return new Promise((resolve, reject) => {
      
      // If we are simulating workload types
      let workerCode = `
        const { parentPort, workerData } = require('worker_threads');
        
        async function execute() {
          const { task } = workerData;
          
          if (task.type === 'CPU_INTENSIVE') {
            // Fake CPU load by spinning
            const duration = task.duration || 3000;
            const end = Date.now() + duration;
            let result = 0;
            while(Date.now() < end) {
              result += Math.random() * Math.random();
            }
            parentPort.postMessage({ success: true, result: 'Computed ' + result });
          } 
          else if (task.type === 'IO_TASK') {
            // Fake IO load by waiting
            const duration = task.duration || 2000;
            setTimeout(() => {
              parentPort.postMessage({ success: true, result: 'IO Completed after ' + duration + 'ms' });
            }, duration);
          } 
          else {
            // Default generic task
            setTimeout(() => {
              parentPort.postMessage({ success: true, result: 'Task Done' });
            }, 1000);
          }
        }
        
        execute().catch(err => parentPort.postMessage({ success: false, error: err.message }));
      `;

      const worker = new Worker(workerCode, { 
        eval: true,
        workerData: { task }
      });

      worker.on('message', (msg) => {
        if (msg.success) resolve(msg.result);
        else reject(msg.error);
      });

      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });
  }
}

module.exports = Executor;
