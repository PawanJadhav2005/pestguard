export const C = {
  forest: '#0d5544', forest2: '#14775d', forest3: '#1d9a78', mint: '#e2f3eb', mint2: '#f0f8f4',
  amber: '#f3a32b', amberInk: '#3b2500', ink: '#13241e', muted: '#5f716a', line: '#e1eae6', bg: '#f2f6f4', white: '#fff',
  bad: '#d4443c', warn: '#cf830f', info: '#2f6fd0', violet: '#7650c9', good: '#178a5b', grey: '#7b8682'
};
export const SVC = {
  gpc: { color: '#e0742f', icon: 'bug-outline' }, ter: { color: '#8a5a2b', icon: 'home-outline' }, bed: { color: '#b5405a', icon: 'bed-outline' },
  mos: { color: '#2f6fd0', icon: 'airplane-outline' }, rod: { color: '#6a6f7c', icon: 'paw-outline' }, san: { color: '#14775d', icon: 'water-outline' }
};
export const STATUS_HUE = { 'Pending': C.grey, 'Assigned': C.info, 'Accepted': C.info, 'On the way': C.violet, 'In Progress': C.warn, 'On Hold': C.warn,
  'Awaiting Approval': C.violet, 'Completed': C.good, 'Unable to Complete': C.bad, 'Cancelled': C.grey };
export const PREP = {
  gpc: ['Empty kitchen cabinets and cover food, utensils and water', 'Keep children and pets out for 2 hours', 'Do not mop treated areas for 7 days'],
  ter: ['Clear 1 ft space along walls and wooden furniture', 'Expect drilling at the skirting for 2 to 4 hours', 'Keep the house ventilated for 4 hours'],
  bed: ['Wash bedsheets and curtains in hot water', 'Stand mattresses upright against the wall', 'Stay out of bedrooms for 4 hours'],
  mos: ['Close windows during fogging', 'Empty stagnant water from pots and coolers', 'Keep pets indoors during outdoor fogging'],
  rod: ['Show the technician where rodents enter', 'Keep bait stations away from children and pets', 'Do not touch bait boxes with bare hands'],
  san: ['Cover electronics and open food', 'Stay out for 1 hour after spraying']
};
export const AREAS = ['Kitchen', 'Bathrooms', 'Bedrooms', 'Living room', 'Balcony', 'Store room', 'Garden', 'Drainage', 'Wooden furniture'];
export const fmt = {
  money: n => '₹' + Number(n || 0).toLocaleString('en-IN'),
  time: d => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
  day: d => {
    const x = new Date(d), t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(x).setHours(0, 0, 0, 0) - t) / 864e5);
    return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  },
  dt: d => d ? `${fmt.day(d)}, ${fmt.time(d)}` : '-',
  date: d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-',
  ago: d => { const m = Math.round((Date.now() - new Date(d)) / 6e4); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`; }
};
