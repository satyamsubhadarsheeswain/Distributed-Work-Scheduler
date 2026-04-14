import React, { useRef, useEffect } from 'react';

function AntigravityVisualizer({ nodes, tasks, showHeatmap }) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    
    const nodePositions = new Map();
    const taskParticles = new Map(); 
    
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      // HEATMAP LAYER
      if (showHeatmap && nodes.length > 0) {
        nodes.forEach(node => {
          const pos = nodePositions.get(node.id);
          if (pos && node.mass > 0.2) {
             const heatGradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 100 + (node.mass * 100));
             const intensity = Math.min(1, node.mass);
             heatGradient.addColorStop(0, `rgba(255, ${200 - (intensity * 200)}, 0, ${intensity * 0.4})`);
             heatGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
             
             ctx.beginPath();
             ctx.arc(pos.x, pos.y, 100 + (node.mass * 100), 0, Math.PI * 2);
             ctx.fillStyle = heatGradient;
             ctx.globalCompositeOperation = 'screen';
             ctx.fill();
             ctx.globalCompositeOperation = 'source-over';
          }
        });
      }
      
      // Update or initialize node positions (circle formation around center)
      const radius = Math.min(width, height) * 0.35;
      const angleStep = (Math.PI * 2) / Math.max(1, nodes.length);
      
      nodes.forEach((node, index) => {
        let pos = nodePositions.get(node.id);
        const targetX = centerX + Math.cos(index * angleStep) * radius;
        const targetY = centerY + Math.sin(index * angleStep) * radius;
        
        if (!pos) {
          pos = { x: targetX, y: targetY };
        } else {
          pos.x += (targetX - pos.x) * 0.05 + (Math.random() - 0.5) * 1.5;
          pos.y += (targetY - pos.y) * 0.05 + (Math.random() - 0.5) * 1.5;
        }
        nodePositions.set(node.id, pos);
        
        // 1. Draw CURRENT mass repulsion field
        const currentMassRadius = 30 + (node.mass * 50);
        const gradient = ctx.createRadialGradient(pos.x, pos.y, 10, pos.x, pos.y, currentMassRadius);
        gradient.addColorStop(0, node.mass > 0.8 ? 'rgba(255, 50, 50, 0.2)' : 'rgba(0, 255, 128, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 255, 128, 0)');
        
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, currentMassRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // 2. Draw PROJECTED mass (Ghost Ring)
        if (node.projectedMass !== undefined) {
          const projectedRadius = 30 + (node.projectedMass * 50);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, projectedRadius, 0, Math.PI * 2);
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = node.projectedMass > node.mass ? 'rgba(255, 100, 100, 0.5)' : 'rgba(100, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]); // reset
        }
        
        // Draw Core Node
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 15, 0, Math.PI * 2);
        ctx.fillStyle = node.mass > 0.8 ? '#ff3232' : node.mass > 0.4 ? '#ffc832' : '#00ff80';
        ctx.fill();
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.fillStyle;
        
        // Node Label
        ctx.fillStyle = '#fff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`M: ${node.mass.toFixed(2)}`, pos.x, pos.y + 30);
      });
      ctx.shadowBlur = 0; // reset
      
      // Draw Tasks logic:
      // Spawn them at center, move to assigned node
      const runningTasks = tasks.filter(t => t.status === 'RUNNING');
      
      runningTasks.forEach(task => {
        let p = taskParticles.get(task.id);
        if (!p) {
          p = { x: centerX, y: centerY, targetId: task.assignedTo };
          taskParticles.set(task.id, p);
        }
        
        const targetNodePos = nodePositions.get(task.assignedTo);
        if (targetNodePos) {
          // Move towards target
          const dx = targetNodePos.x - p.x;
          const dy = targetNodePos.y - p.y;
          p.x += dx * 0.08;
          p.y += dy * 0.08;
          
          // Draw connecting line
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(targetNodePos.x, targetNodePos.y);
          ctx.strokeStyle = 'rgba(0, 200, 255, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Draw Task Particle
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#00c8ff';
          ctx.fill();
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#00c8ff';
        }
      });
      ctx.shadowBlur = 0;

      // Clean up old tasks
      const activeIds = new Set(runningTasks.map(t => t.id));
      for (const id of taskParticles.keys()) {
        if (!activeIds.has(id)) taskParticles.delete(id);
      }

      // Draw Center Emitter
      ctx.beginPath();
      ctx.arc(centerX, centerY, 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();

      animationFrameId = requestAnimationFrame(render);
    };
    
    render();
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [nodes, tasks]);

  return (
    <div className="canvas-container">
       <canvas 
        ref={canvasRef} 
        width={800} 
        height={600} 
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      />
    </div>
  );
}

export default AntigravityVisualizer;
