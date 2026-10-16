import placement from './pier-rope-layout.json';
import type {Room} from './data';

/** Seven reused native posts sit outside the old 110-unit pier walk surface.
 * The rope itself is assembled into the Harbor floor bitmap below all actors. */
export function addPierRopePosts(rooms:Record<string,Room>){
 for(const [i,p] of placement.posts.entries())rooms.harbor.props.push({
  id:'pier-rope-post-'+i,art:'existing-C-post-5x26',
  at:{x:p.x+placement.postEventXOffset,y:p.y},width:5
 });
}
