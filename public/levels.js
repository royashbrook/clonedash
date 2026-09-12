import { object as o } from './engine.js';
export const LEVELS = [
  { name: 'First Spark', note: 'Find your rhythm', color: '#9aff6b', length: 34, objects: [o('half', 6), o('half', 12), o('spike', 18), o('half', 24), o('spike', 30)] },
  { name: 'Step It Up', note: 'Take the high road', color: '#53e3ff', length: 42, objects: [o('spike', 6), o('block', 12), o('grid', 13), o('half', 19), o('grid', 25), o('block', 26), o('spike', 33), o('half', 38)] },
  { name: 'Air Time', note: 'Hold to fly. Let go to fall.', color: '#ffd166', length: 48, objects: [o('half', 6), o('plane', 11), o('grid', 17), o('grid', 23, 5), o('spike', 30), o('square', 36), o('spike', 42)] },
  { name: 'Double Take', note: 'Keep the jumps coming', color: '#ff8ac4', length: 54, objects: [o('spike', 6), o('half', 9), o('block', 14), o('grid', 15), o('spike', 20), o('half', 23), o('grid', 28), o('grid', 29), o('spike', 34), o('half', 37), o('block', 43), o('spike', 49)] },
  { name: 'Sky Circuit', note: 'Thread the flight path', color: '#b9a0ff', length: 62, objects: [o('spike', 6), o('plane', 11), o('block', 18), o('grid', 18, 1), o('grid', 24, 4), o('grid', 24, 5), o('block', 30), o('grid', 30, 1), o('grid', 36, 4), o('spike', 42), o('square', 47), o('spike', 54), o('half', 58)] },
  { name: 'Switchcraft', note: 'Square. Plane. Square. Go.', color: '#ffb477', length: 70, objects: [o('grid', 6), o('spike', 12), o('plane', 17), o('grid', 24, 1), o('grid', 30, 4), o('square', 36), o('spike', 43), o('grid', 48), o('plane', 54), o('grid', 60, 1), o('grid', 64, 5)] },
  { name: 'Clone Dash', note: 'Put it all together', color: '#72f7dc', length: 82, objects: [o('spike', 6), o('half', 9), o('grid', 14), o('block', 15), o('spike', 20), o('plane', 25), o('grid', 32, 1), o('grid', 37, 4), o('block', 42, 1), o('square', 47), o('spike', 54), o('half', 57), o('block', 62), o('grid', 63), o('plane', 68), o('grid', 74, 1), o('grid', 78, 4)] },
];
