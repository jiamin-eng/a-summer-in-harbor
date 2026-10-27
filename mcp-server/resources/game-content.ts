/**
 * MCP Resources - game lore, maps, characters, rules
 */

import type { Locale } from '../../src/world/data';
import { rooms, people } from '../../src/world/data';

export function getGameIntroduction(locale: Locale): string {
  if (locale === 'zh') {
    return `# 海湾新生活

一个普通人来到海湾小镇度过夏天的2D开放探索RPG。

## 游戏世界
五个室外地区、室内外共二十处地点、渐进式入住引导、街坊交谈、三条解决通行问题的路线，以及切磋、走位、垂钓、修理和拼图。

## 玩法
- 探索海湾小镇的各个地点
- 与居民交谈，建立关系
- 完成任务，帮助镇上的居民
- 收集物品，解决问题
- 钓鱼、修理、拼图等小游戏

## 故事
你是一位来海湾小镇度过夏天的新房客。玛拉是你的房东，她会给你租屋的钥匙。在这个夏天，你将认识镇上的居民，帮助他们解决问题，体验小镇的生活。`;
  } else {
    return `# A Summer in Harbor

An open-world exploration RPG where an ordinary person spends a summer in a coastal town.

## Game World
Five outdoor districts, twenty indoor and outdoor locations, progressive settling-in guidance, neighbor conversations, three routes to solve access problems, plus sparring, fishing, repairs, and puzzles.

## Gameplay
- Explore various locations in the harbor town
- Talk to residents and build relationships
- Complete quests and help townspeople
- Collect items and solve problems
- Mini-games: fishing, repairs, puzzles

## Story
You're a new tenant spending the summer in the harbor town. Mara is your landlord who will give you the room key. During this summer, you'll meet the residents, help them with their problems, and experience town life.`;
  }
}

export function getWorldMap(locale: Locale): string {
  const isZh = locale === 'zh';
  
  let map = isZh ? '# 世界地图\n\n' : '# World Map\n\n';
  
  // Group rooms by area
  const areas: Record<string, string[]> = {};
  for (const [id, room] of Object.entries(rooms)) {
    if (!areas[room.area]) areas[room.area] = [];
    areas[room.area].push(id);
  }
  
  for (const [area, roomIds] of Object.entries(areas)) {
    const areaRoom = rooms[area];
    map += `## ${areaRoom.title[isZh ? 0 : 1]}\n`;
    
    for (const roomId of roomIds) {
      if (roomId === area) continue;
      const room = rooms[roomId];
      map += `- ${room.title[isZh ? 0 : 1]}\n`;
    }
    map += '\n';
  }
  
  return map.trim();
}

export function getCharacters(locale: Locale): string {
  const isZh = locale === 'zh';
  
  let chars = isZh ? '# 角色列表\n\n' : '# Characters\n\n';
  
  for (const [id, person] of Object.entries(people)) {
    chars += `## ${person.name[isZh ? 0 : 1]}\n`;
    chars += `${person.intro[isZh ? 0 : 1]}\n\n`;
  }
  
  return chars.trim();
}

export function getHowToPlay(locale: Locale): string {
  if (locale === 'zh') {
    return `# 如何游玩

## 基本操作
1. **观察场景**: 查看当前位置的人物、物品和出口
2. **与人交谈**: 先介绍自己，然后选择话题交谈
3. **移动**: 前往相邻地点，或快速旅行到已访问地点
4. **使用物品**: 与场景中的物品互动
5. **查看背包**: 查看拥有的物品
6. **查看状态**: 查看精力、资金、声望等

## 游戏机制
- **精力**: 行动需要精力，可以通过休息或吃东西恢复
- **资金**: 可以购买物品或服务
- **声望**: 帮助居民提升声望
- **关系**: 与居民交谈可以提升关系值

## 任务流程
1. 在车站街找玛拉领取钥匙
2. 去租屋放下行李
3. 回来告诉玛拉你安顿好了
4. 探索小镇，认识更多居民
5. 完成各种任务

## 注意事项
- 每个地点只能进行该地点允许的操作
- 某些动作需要特定物品或条件
- 对话话题会随着游戏进度解锁
- 游戏状态由游戏引擎完全控制，请遵循工具返回的结果`;
  } else {
    return `# How to Play

## Basic Actions
1. **Observe Scene**: View people, objects, and exits at your location
2. **Talk to People**: Introduce yourself first, then choose topics
3. **Move**: Travel to adjacent locations or fast-travel to visited places
4. **Use Objects**: Interact with objects in the scene
5. **View Inventory**: Check your items
6. **View Status**: Check energy, money, standing, etc.

## Game Mechanics
- **Energy**: Actions require energy; rest or eat to recover
- **Money**: Buy items or services
- **Standing**: Help residents to increase standing
- **Relationships**: Talking increases relationship values

## Quest Flow
1. Find Mara at Station Street to get your key
2. Go to your room and unpack
3. Return and tell Mara you're settled
4. Explore the town and meet more residents
5. Complete various quests

## Important Notes
- Each location only allows specific actions
- Some actions require specific items or conditions
- Dialogue topics unlock as you progress
- Game state is fully controlled by the engine; follow tool results`;
  }
}
