import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function NodeList({ nodes }) {
  if (nodes.length === 0) {
    return <div className="empty-state">No workers connected. Spawn one to begin.</div>;
  }

  // Format data for chart
  const chartData = nodes.map(n => ({
    name: n.id.slice(-4),
    cpu: Math.round(n.metrics.cpu * 100) || 0,
    ram: Math.round(n.metrics.ram * 100) || 0,
    mass: parseFloat(n.mass.toFixed(2))
  }));

  return (
    <div className="node-list">
      <div className="charts-container">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" stroke="#666" fontSize={12} />
            <YAxis stroke="#666" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }}/>
            <Bar dataKey="cpu" fill="#00ff80" name="CPU %" stackId="a" />
            <Bar dataKey="ram" fill="#0080ff" name="RAM %" stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="nodes-details">
        {nodes.map(n => {
          const loadColor = n.mass > 0.8 ? 'critical' : n.mass > 0.4 ? 'warning' : 'ok';
          return (
            <div key={n.id} className={`node-card ${loadColor}`}>
              <div className="node-id">{n.id}</div>
              <div className="node-stats">
                <div>Mass: {n.mass.toFixed(2)}G</div>
                <div>CPU: {(n.metrics.cpu * 100).toFixed(1)}%</div>
                <div>Tasks: {n.metrics.runningTasks || 0}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default NodeList;
