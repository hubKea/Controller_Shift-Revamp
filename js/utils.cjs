/**
 * Utility functions for the shift report system
 * CommonJS version for testing compatibility
 */

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  nowIso
};

