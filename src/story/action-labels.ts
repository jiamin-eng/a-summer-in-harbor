import type { Words } from '../world/data';
import { chapelActionLabels } from './chapel';

/** Button labels the game page shows for an entity action. */
export const actionLabels: Record<string, Words> = {
  ...chapelActionLabels,
  'animal-call': ['轻声招呼', 'Call softly'],
  'animal-pet': ['轻轻抚摸', 'Pet gently'],
  unpack: ['放下行李', 'Put your bag down'],
  rest: ['小睡三小时', 'Nap for three hours'],
  sleep: ['睡到早上九点', 'Sleep until 9 in the morning'],
  'water-fern': ['给小蕨浇水', 'Water the young fern'],
  'repair-terrace': ['检查灯的接线', 'Check the lantern wiring'],
  'inspect-bridge': ['查看损坏的地方', 'Inspect the damage'],
  'repair-bridge': ['用工具和两块木板修桥', 'Repair with tools and two planks'],
  'gather-wood': ['拾取结实的木板', 'Gather sound timber'],
  'open-route': ['安排海岸通行', 'Set up coast access'],
  'read-market': ['读集市告示', 'Read the market notice'],
  'open-market': ['告诉大家路线准备好了', 'Share the good news'],
  'assemble-map': ['拼合旧路线图', 'Put the route map together'],
  'inspect-garden': ['读门上的便条', 'Read the note'],
  'notes-observe': ['仔细查看', 'Take a close look'],
  'read-weather': ['翻看记录本', 'Read the logbook'],
};
