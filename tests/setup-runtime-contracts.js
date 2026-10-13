// Shared runtime interfaces are classic scripts in the extension and real
// modules here, so evaluated production sources see the same checked contract.
require('../src/lib/runtime-contracts');
require('../src/lib/dictionary-store');
require('../src/lib/engine-adapters');
require('../src/lib/engine-matcher');
