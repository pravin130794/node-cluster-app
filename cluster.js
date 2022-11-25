const cluster = require('cluster');

const workerCount = 4;

cluster.setupMaster({ exec: 'server.js' });

// Gets the count of active workers
function numWorkers() {
  return Object.keys(cluster.workers).length;
}

let stopping = false;

// Forks off the workers unless the server is stopping
function forkNewWorkers() {
  if (!stopping) {
    for (let i = numWorkers(); i < workerCount; i++) {
      cluster.fork();
    }
  }
}

// A list of workers queued for a restart
let workersToStop = [];

// Stops a single worker
// Gives 60 seconds after disconnect before SIGTERM
function stopWorker(worker) {
  console.log('stopping worker pid:%s', worker.process.pid);
  worker.disconnect();
  const killTimer = setTimeout(function () {
    worker.kill();
  }, 60000);

  // Ensure we don't stay up just for this setTimeout
  killTimer.unref();
}

// Tell the next worker queued to restart to disconnect
// This will allow the process to finish it's work
// for 60 seconds before sending SIGTERM
function stopNextWorker() {
  const i = workersToStop.pop();
  const worker = cluster.workers[i];
  if (worker) stopWorker(worker);
}

// Stops all the works at once
function stopAllWorkers() {
  stopping = true;
  console.log('stopping all workers');
  for (const id in cluster.workers) {
    stopWorker(cluster.workers[id]);
  }
}

// Worker is now listening on a port
// Once it is ready, we can signal the next worker to restart
cluster.on('listening', stopNextWorker);

// A worker has disconnected either because the process was killed
// or we are processing the workersToStop array restarting each process
// In either case, we will fork any workers needed
cluster.on('disconnect', forkNewWorkers);

// HUP signal sent to the master process to start restarting all the workers sequentially
process.on('SIGHUP', function () {
  console.log('restarting all workers');
  workersToStop = Object.keys(cluster.workers);
  stopNextWorker();
});

// Kill all the workers at once
process.on('SIGTERM', stopAllWorkers);

// Fork off the initial workers
forkNewWorkers();
console.log('api master started with pid:%s', process.pid);
