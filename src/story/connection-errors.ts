import type {Words} from '../world/data';
const messages:Record<string,Words>={
 CLIENT_REFRESH_REQUIRED:['请重新载入游戏；已保存的钓获仍保留。','Reload the game; your saved catch is kept.'],
 SERVER_UPDATE_REQUIRED:['服务正在更新，请稍后重新载入。','The service is updating. Reload shortly.'],
 FISHING_NEW_STARTS_CLOSED:['暂时不能开始新一竿。已有钓获仍可确认入包。','New casts are paused. You can still confirm an existing catch.'],
 PLATFORM_LOGIN_REQUIRED:['请先登录账号，再开始或继续旅程。','Sign in before starting or continuing a journey.'],
 login_required:['登录已取消。准备好时可以再试。','Sign-in was cancelled. Try again when you are ready.'],
 PLATFORM_ID_UNAVAILABLE:['登录窗口已关闭，但平台账号信息尚未同步。请稍后再试；已有旅程不变。','The sign-in window closed, but platform account information has not arrived. Try again shortly; saved journeys stay.'],
 PLATFORM_LOGIN_UNAVAILABLE:['登录入口暂时无法打开，请重新载入后再试。','Sign-in could not open. Reload and try again.'],
 PLATFORM_TOKEN_REQUIRED:['平台身份和令牌尚未同时就绪，请稍后重新登录。','The platform identity and token are not both ready. Sign in again shortly.'],
 PLATFORM_HTTP_REJECTED:['平台登录已失效，请重新登录；已有旅程保留。','Your platform sign-in expired. Sign in again; your journeys remain saved.'],
 PLATFORM_HTTP_UNAVAILABLE:['暂时无法核验平台登录，请稍后重试；已有旅程保留。','Platform sign-in could not be checked. Retry shortly; your journeys remain saved.'],
 JOURNEY_EMPTY:['还没有旅程，选择新游戏开始。','You have no journeys yet. Choose New game to begin.'],
 SESSION_LIMIT:['已保留100段旅程。请选择继续已有旅程。','You have 100 saved journeys. Continue an existing one.'],

 PLAY_WINDOW_CLOSED:['海湾目前暂停开放。你的旅程仍保留着，请稍后回来。','The bay is closed for now. Your journey is saved; please come back later.'],
 PUBLIC_DEPLOYMENT_UNCONFIGURED:['海湾还在准备迎接访客，请稍后再来。','The bay is getting ready for visitors. Please come back later.'],
 SERVICE_UNAVAILABLE:['暂时连不上海湾，请稍后重新连接。','The bay cannot be reached right now. Please reconnect in a moment.'],
 PLAYER_SESSION_REQUIRED:['请重新连接，再继续这段旅程。','Please reconnect to continue your journey.'],
 PENDING_ACTION:['正在确认上一次操作的结果，请重新读取进度。','Your last action is being checked. Please reload your progress.']
};
export function connectionError(code:string){return messages[code]}
