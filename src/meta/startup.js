// Pure startup/routing policy. Optional asset promises are deliberately not
// part of this state: they may resolve, reject, or never settle without taking
// ownership of the player's Start action.

export function isFreshSave(save) {
  if (!save || typeof save !== 'object') return true;
  return Object.keys(save.stars || {}).length === 0 && (Number(save.unlockedLevel) || 1) <= 1;
}

export function startRoute(save) {
  return isFreshSave(save) ? 'level-1' : 'world-map';
}

export function createStartLatch() {
  let accepted = false;
  return {
    accept() {
      if (accepted) return false;
      accepted = true;
      return true;
    },
    get accepted() { return accepted; },
  };
}

export function beginOptionalAssets({ textures, models, onTextures, onModels } = {}) {
  const textureTask = Promise.resolve().then(() => (typeof textures === 'function' ? textures() : null))
    .then((value) => { if (typeof onTextures === 'function') onTextures(value); return value; })
    .catch(() => { if (typeof onTextures === 'function') onTextures(null); return null; });
  const modelTask = Promise.resolve().then(() => (typeof models === 'function' ? models() : null))
    .then((value) => { if (typeof onModels === 'function') onModels(value); return value; })
    .catch(() => { if (typeof onModels === 'function') onModels(null); return null; });
  return { textureTask, modelTask };
}
