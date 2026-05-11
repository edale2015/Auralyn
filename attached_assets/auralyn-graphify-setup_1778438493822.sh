#!/bin/bash
# ============================================================
# AURALYN — Graphify Setup Script
# Run this ONCE from the root of your Auralyn monorepo
# ============================================================

echo "Installing Graphify..."
pip install graphifyy

echo "Installing Claude Code MCP extension..."
graphify install

echo ""
echo "Graphify installed. Now run the graph builder (see instructions below)."
echo ""
echo "============================================================"
echo "AURALYN-SPECIFIC USAGE"
echo "============================================================"
echo ""
echo "1. FULL CODEBASE MAP (run once, takes ~5-10 min for Auralyn's size):"
echo "   /graphify ."
echo ""
echo "2. CLINICAL PIPELINE ONLY (faster, use when debugging triage issues):"
echo "   /graphify ./server/routes/clinical ./server/engines ./shared/kb"
echo ""
echo "3. SAFETY LAYER ONLY (use when reviewing red flag logic):"
echo "   /graphify ./server/safety ./server/agents/SafetyAgent.ts"
echo ""
echo "4. BILLING + REVENUE ONLY:"
echo "   /graphify ./server/routes/billing ./server/agents/BillingAgent.ts"
echo ""
echo "Output will appear in: graphify-out/"
echo "  graph.html        — click around to explore relationships"
echo "  GRAPH_REPORT.md   — paste this into Claude to give it the map"
echo "  graph.json        — queryable, reusable later"
echo ""
