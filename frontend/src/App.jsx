import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import AntigravityVisualizer from './components/AntigravityVisualizer';
import NodeList from './components/NodeList';
import './index.css';

// Smart socket connection: in development (Vite), point to the separate server port. 
// In production, connect to the same port that served the page.
const socket = io(import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin);

function App() {
  const [systemState, setSystemState] = useState({ nodes: [], tasks: [], queueSize: 0, history: [], chaosMode: false });
  const [autoSim, setAutoSim] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState('NORMAL');

  useEffect(() => {
    socket.on('system_state', (state) => {
      setSystemState(state);
    });

    return () => socket.off('system_state');
  }, []);

  // Auto-Simulation Logic
  useEffect(() => {
    let interval;
    if (autoSim) {
      interval = setInterval(() => {
        const type = Math.random() > 0.5 ? 'CPU_INTENSIVE' : 'IO_TASK';
        const priority = Math.random() > 0.8 ? 'URGENT' : Math.random() > 0.5 ? 'HIGH' : 'NORMAL';
        socket.emit('submit_task', { type, priority, duration: 2000 + Math.random() * 3000 });
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [autoSim]);

  const spawnWorker = () => {
    socket.emit('spawn_workers', { count: 1 });
  };

  const killWorker = () => {
    socket.emit('kill_worker', { workerId: 'any' });
  };

  const toggleChaos = (e) => {
    socket.emit('toggle_chaos', e.target.checked);
  };

  const submitManualTask = (type) => {
    socket.emit('submit_task', { 
      type, 
      priority: selectedPriority, 
      duration: type === 'CPU_INTENSIVE' ? 4000 : 2500 
    });
  };

  return (
    <div className="dashboard">
      <header className="header">
        <h1>Distributed Work Scheduler</h1>
        <div className="controls">
          <button onClick={spawnWorker} className="btn primary">Spawn Worker</button>
          <button onClick={killWorker} className="btn danger">Kill Worker</button>
          
          <div className="divider"></div>
          
          <div className="sim-toggle chaos-badge">
            <label className="switch chaos-switch">
              <input type="checkbox" checked={systemState.chaosMode} onChange={toggleChaos} />
              <span className="slider"></span>
            </label>
            <span className="sim-label" style={{color: 'var(--accent-red)'}}>Chaos</span>
          </div>

          <div className="sim-toggle">
            <label className="switch">
              <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} />
              <span className="slider"></span>
            </label>
            <span className="sim-label">Heatmap</span>
          </div>
          
          <div className="divider"></div>
          
          <div className="priority-select">
            <select value={selectedPriority} onChange={(e) => setSelectedPriority(e.target.value)}>
              <option value="NORMAL">NORMAL PRIO</option>
              <option value="HIGH">HIGH PRIO</option>
              <option value="URGENT">URGENT</option>
            </select>
          </div>

          <button onClick={() => submitManualTask('CPU_INTENSIVE')} className="btn action">Sim CPU</button>
          <button onClick={() => submitManualTask('IO_TASK')} className="btn action">Sim I/O</button>
          
          <div className="sim-toggle">
            <label className="switch">
              <input type="checkbox" checked={autoSim} onChange={(e) => setAutoSim(e.target.checked)} />
              <span className="slider"></span>
            </label>
            <span className="sim-label">Auto</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="panel visualizer-panel">
          <div className="panel-header">
            <h2>Live Grid Visualization</h2>
            <div className="legend">
              <span className="legend-item"><span className="dot core"></span> Real Load</span>
              <span className="legend-item"><span className="dot ghost"></span> Projected</span>
              {showHeatmap && <span className="legend-item" style={{color:'orange'}}>🔥 Heat</span>}
            </div>
          </div>
          <AntigravityVisualizer nodes={systemState.nodes} tasks={systemState.tasks} showHeatmap={showHeatmap} />
        </div>

        <div className="side-panels">
          <div className="panel query-panel">
            <div className="tabs">
              <h2 className="active">Queue & History</h2>
            </div>
            
            <div className="queue-stats-container">
              <div className="queue-stat">
                <span className="queue-value">{systemState.activeCount || 0}</span>
                <span className="queue-label">Active Tasks</span>
              </div>
              <div className="queue-stat secondary">
                <span className="queue-value">{systemState.queueSize}</span>
                <span className="queue-label">Backlog</span>
              </div>
            </div>
            
            <div className="scroll-area">
                <div className="recent-tasks">
                  <h3>Active Task Stream</h3>
                  <ul>
                    {systemState.tasks.filter(t => t.status !== 'COMPLETED').slice(-8).reverse().map(t => (
                      <li key={t.id} className={`task-item ${t.status.toLowerCase()}`}>
                        <span className="task-id">{t.id.slice(0, 8)}</span>
                        <span className="task-badge">{t.priority}</span>
                        <span className="task-status">{t.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="history-ledger">
                  <h3>Execution History</h3>
                  <ul>
                    {systemState.history.map(t => (
                      <li key={t.id} className="history-item">
                        <span className={`status-dot ${t.status.toLowerCase()}`}></span>
                        <span className="h-type">{t.type}</span>
                        <span className="h-time">{t.executionTime}ms</span>
                        <span className="h-node">{t.assignedTo.slice(-4)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
            </div>
          </div>

          <div className="panel node-panel">
            <h2>Nodes & Telemetry</h2>
            <NodeList nodes={systemState.nodes} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
