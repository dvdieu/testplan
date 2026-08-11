export const PHASES = ['engine', 'support', 'cheat'];

export const PHASE_META = {
  engine: {
    label: 'Engine',
    itemLabel: 'Bo-Tools',
    desiredLabel: 'Bo-Tools mong muốn',
  },
  support: {
    label: 'Support',
    itemLabel: 'Support-Tools',
    desiredLabel: 'Support-Tools mong muốn',
  },
  cheat: {
    label: 'Cheat',
    itemLabel: 'Cheat Tools',
    desiredLabel: 'Cheat Tools mong muốn',
  },
};

export function phaseLabel(phase) {
  return PHASE_META[phase]?.label || phase;
}

export function phaseItemLabel(phase) {
  return PHASE_META[phase]?.itemLabel || phase;
}

export function phaseDesiredLabel(phase) {
  return PHASE_META[phase]?.desiredLabel || `${phase} mong muốn`;
}
