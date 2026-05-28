import { defineConfig, searchForWorkspaceRoot } from 'vite';
import path from 'node:path';

const siteRoot = path.resolve(__dirname, 'javascript/site');
const distDir = path.resolve(__dirname, 'build/javascript/site');

export default defineConfig({
  root: siteRoot,
  base: './',
  publicDir: false,
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    outDir: distDir,
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        bop_project_selection: path.resolve(siteRoot, 'bop_project_selection.html'),
        cbc_simple_mip: path.resolve(siteRoot, 'cbc_simple_mip.html'),
        clp_simple_lp: path.resolve(siteRoot, 'clp_simple_lp.html'),
        clp_transportation: path.resolve(siteRoot, 'clp_transportation.html'),
        glop_simple_lp: path.resolve(siteRoot, 'glop_simple_lp.html'),
        glop_stigler_diet: path.resolve(siteRoot, 'glop_stigler_diet.html'),
        glpk_simple_lp: path.resolve(siteRoot, 'glpk_simple_lp.html'),
        glpk_simple_mip: path.resolve(siteRoot, 'glpk_simple_mip.html'),
        index: path.resolve(siteRoot, 'index.html'),
        knapsack_simple: path.resolve(siteRoot, 'knapsack_simple.html'),
        magic_square: path.resolve(siteRoot, 'magic_square.html'),
        mathopt_basic: path.resolve(siteRoot, 'mathopt_basic.html'),
        mathopt_factory_floor: path.resolve(siteRoot, 'mathopt_factory_floor.html'),
        model_playground: path.resolve(siteRoot, 'model_playground.html'),
        mp_simple_lp: path.resolve(siteRoot, 'mp_simple_lp.html'),
        mpsolver_network_design: path.resolve(siteRoot, 'mpsolver_network_design.html'),
        network_flow_assignment: path.resolve(siteRoot, 'network_flow_assignment.html'),
        network_flow_max_flow: path.resolve(siteRoot, 'network_flow_max_flow.html'),
        network_flow_min_cost_flow: path.resolve(siteRoot, 'network_flow_min_cost_flow.html'),
        routing_dispatch: path.resolve(siteRoot, 'routing_dispatch.html'),
        rcpsp_project: path.resolve(siteRoot, 'rcpsp_project.html'),
        routing_simple: path.resolve(siteRoot, 'routing_simple.html'),
        routing_vrp: path.resolve(siteRoot, 'routing_vrp.html'),
        sat_simple_mip: path.resolve(siteRoot, 'sat_simple_mip.html'),
        scip_assignment: path.resolve(siteRoot, 'scip_assignment.html'),
        scip_simple_mip: path.resolve(siteRoot, 'scip_simple_mip.html'),
        schema_viewer: path.resolve(siteRoot, 'schema_viewer.html'),
        set_cover_simple: path.resolve(siteRoot, 'set_cover_simple.html'),
        gscip_simple_mip: path.resolve(siteRoot, 'gscip_simple_mip.html'),
        sports_scheduling: path.resolve(siteRoot, 'sports_scheduling.html'),
        steel_mill_slab: path.resolve(siteRoot, 'steel_mill_slab.html'),
        sudoku_generator: path.resolve(siteRoot, 'sudoku_generator.html'),
      },
    },
  },
});
