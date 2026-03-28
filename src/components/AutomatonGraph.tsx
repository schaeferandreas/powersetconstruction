/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { StateId, Symbol } from '../types';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  isStart: boolean;
  isFinal: boolean;
  isHighlighted?: boolean;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  label: string;
  isHighlighted?: boolean;
  hasReverse?: boolean;
}

interface AutomatonGraphProps {
  states: string[];
  transitions: { from: string; to: string; label: string }[];
  startStates: string[];
  finalStates: string[];
  highlightedStates?: string[];
  highlightedTransitions?: { from: string; to: string; label: string }[];
  width?: number;
  height?: number;
}

const AutomatonGraph: React.FC<AutomatonGraphProps> = ({
  states,
  transitions,
  startStates,
  finalStates,
  highlightedStates = [],
  highlightedTransitions = [],
  width = 600,
  height = 400,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const nodes: Node[] = states.map(id => ({
      id,
      isStart: startStates.includes(id),
      isFinal: finalStates.includes(id),
      isHighlighted: highlightedStates.includes(id)
    }));

    // Group transitions by source and target to combine labels
    const groupedTransitions: Record<string, string[]> = {};
    transitions.forEach(t => {
      const key = `${t.from}->${t.to}`;
      if (!groupedTransitions[key]) groupedTransitions[key] = [];
      groupedTransitions[key].push(t.label);
    });

    const links: Link[] = Object.entries(groupedTransitions).map(([key, labels]) => {
      const [from, to] = key.split("->");
      const isHighlighted = highlightedTransitions.some(ht => 
        ht.from === from && ht.to === to
      );
      
      // Check if there is a reverse link
      const hasReverse = from !== to && groupedTransitions[`${to}->${from}`] !== undefined;
      
      return {
        source: from,
        target: to,
        label: labels.join(", "),
        isHighlighted,
        hasReverse
      };
    });

    const simulation = d3.forceSimulation<Node>(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id(d => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(50));

    // Arrowhead markers
    const defs = svg.append("defs");
    
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 8) // Tip is at 10, so 2 units ahead of path end
      .attr("refY", 0)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5Z")
      .attr("fill", "#666");

    defs.append("marker")
      .attr("id", "arrowhead-highlight")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5Z")
      .attr("fill", "#ef4444");

    const linkGroup = svg.append("g")
      .attr("class", "links");

    const link = linkGroup.selectAll(".link")
      .data(links)
      .enter().append("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("stroke", d => d.isHighlighted ? "#ef4444" : "#999")
      .attr("stroke-width", d => d.isHighlighted ? 4 : 2)
      .attr("marker-end", d => d.isHighlighted ? "url(#arrowhead-highlight)" : "url(#arrowhead)");

    const linkLabel = svg.append("g")
      .attr("class", "link-labels")
      .selectAll("text")
      .data(links)
      .enter().append("text")
      .attr("font-size", "12px")
      .attr("fill", d => d.isHighlighted ? "#ef4444" : "#333")
      .attr("font-weight", d => d.isHighlighted ? "bold" : "normal")
      .attr("text-anchor", "middle")
      .text(d => d.label);

    const node = svg.append("g")
      .attr("class", "nodes")
      .selectAll(".node")
      .data(nodes)
      .enter().append("g")
      .attr("class", "node")
      .call(d3.drag<SVGGElement, Node>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Outer circle for final states
    node.filter(d => d.isFinal)
      .append("circle")
      .attr("r", 24)
      .attr("fill", "none")
      .attr("stroke", "#333")
      .attr("stroke-width", 2);

    // Main circle
    node.append("circle")
      .attr("r", 20)
      .attr("fill", d => d.isHighlighted ? "#fee2e2" : (d.isStart ? "#e0f2fe" : "#fff"))
      .attr("stroke", d => d.isHighlighted ? "#ef4444" : (d.isStart ? "#0369a1" : "#333"))
      .attr("stroke-width", d => d.isHighlighted ? 3 : 2);

    // Start arrow
    node.filter(d => d.isStart)
      .append("path")
      .attr("d", "M-40,0 L-25,0")
      .attr("stroke", "#0369a1")
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrowhead)");

    node.append("text")
      .attr("dy", ".35em")
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text(d => d.id);

    simulation.on("tick", () => {
      link.attr("d", d => {
        const source = d.source as Node;
        const target = d.target as Node;
        if (source === target) {
          // Self-loop: Arc that ends with a line to center to fix marker positioning
          // We end the path at distance 22 from center to hide the thick line under the arrow head
          const x = source.x!, y = source.y!;
          // Point at distance 25 to start the orientation segment
          const x25 = x + 15; 
          const y20 = y - 20;
          // Point at distance 22 to end the path
          const x22 = x + 13.2;
          const y17_6 = y - 17.6;
          return `M${x-12},${y-16} A15,15 0 1,1 ${x25},${y20} L${x22},${y17_6}`;
        }
        
        if (d.hasReverse) {
          // Curved line for bidirectional transitions
          const dx = target.x! - source.x!;
          const dy = target.y! - source.y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const mx = (source.x! + target.x!) / 2;
          const my = (source.y! + target.y!) / 2;
          const offset = 30;
          const cx = mx - (dy / dist) * offset;
          const cy = my + (dx / dist) * offset;
          
          // Shorten the endpoint for the marker
          const dtx = target.x! - cx;
          const dty = target.y! - cy;
          const ddist = Math.sqrt(dtx * dtx + dty * dty) || 1;
          const targetX = target.x! - (dtx / ddist) * 22;
          const targetY = target.y! - (dty / ddist) * 22;
          
          return `M${source.x},${source.y} Q${cx},${cy} ${targetX},${targetY}`;
        }
        
        // Straight line shortened to end at distance 22 from target center
        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetX = target.x! - (dx / dist) * 22;
        const targetY = target.y! - (dy / dist) * 22;
        
        return `M${source.x},${source.y}L${targetX},${targetY}`;
      });

      linkLabel
        .attr("x", d => {
          const source = d.source as Node;
          const target = d.target as Node;
          if (source === target) return source.x!;
          if (d.hasReverse) {
            const dx = target.x! - source.x!;
            const dy = target.y! - source.y!;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const mx = (source.x! + target.x!) / 2;
            const offset = 40;
            return mx - (dy / dist) * offset;
          }
          return (source.x! + target.x!) / 2;
        })
        .attr("y", d => {
          const source = d.source as Node;
          const target = d.target as Node;
          if (source === target) return source.y! - 45;
          if (d.hasReverse) {
            const dx = target.x! - source.x!;
            const dy = target.y! - source.y!;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const my = (source.y! + target.y!) / 2;
            const offset = 40;
            return my + (dx / dist) * offset;
          }
          return (source.y! + target.y!) / 2 - 5;
        });

      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: Node) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [states, transitions, startStates, finalStates, highlightedStates, highlightedTransitions, width, height]);

  return (
    <div className="border rounded-lg bg-white overflow-hidden shadow-inner">
      <svg ref={svgRef} width={width} height={height} />
    </div>
  );
};

export default AutomatonGraph;
