/**
 * Registers every mini-game (importing a module registers it) and re-exports
 * the framework. The engine imports this file once.
 */
import './trial';
import './scenes';
export * from './minigame';
