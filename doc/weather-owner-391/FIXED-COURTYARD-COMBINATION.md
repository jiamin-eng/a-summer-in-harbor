# 四五期天气与固定庭院故事的小范围组合

父候选4fada63基于正式391eb78，本增量仅2服务端生产文件（animal-content.ts及authored-courtyard-sun-turns.json）与此文档。小小银2026-10-10转达既有免费固定内容开发接续；来源d70711a两文件4416字节补丁，hash验证通过，46文件manifest零漂移。没有正式发布批准。

## 玩家内容

已认识Dani时可接『同一片阳光，轮流的座位 / Taking turns in the sun』。按既有真实猫日程，上午观察庭院猫2晒太阳、下午观察猫3晒太阳，回Dani分享。无期限、可取消保留发现，关系+1一次、知识1页，物品/现金不改。人工固定编写，不声称AI生成或独立模型审核。原猫/鸥故事和所有ref/hash均保留。

## owner本轮必要组合证据

仅对天气组合启用原weather settlement，2固定内容/正常流程测试通过；实际原authority流程14business、84motion、4active、2现场采样，不注入proof或收藏。SQLite关闭重开、页读取、同action幂等重放、重复新action拒绝、跨owner拒绝与关闭新开始的reader工程fixture可读。390英文/320中文原Main/RPGJS实际接取和知识页、重载奖励不增加；0页面错误、0模型/生产/真实玩家。组合TypeScript/Vite和后端编译、source/staged/dist/dist-server secrets、API与strict UI通过。前端372构建文件与4fada63候选逐字节一致，天气矩阵无需重跑。

AI续写a1f3286十四文件及任何新模型路由/调用/预算、台风、新动物美术均未混入。既有未知费用门槛仍阻止AI真测；本固定故事不依赖该门槛。实体手机/Telegram/新玩家理解未验证；天气性能/旧4个未分类409及自然闪光物理显示限制见INTEGRATION.md。

## 发布与回退边界

未来同批可发布这一组合提交的主站与GitHub前端镜像，并以同commit编译后端替换现有ECS唯一运行时，保留现有Save数据库、authority/vendor与所有旧定义；GitHub仍仅前端镜像。后端必须实际切换并回读新定义，仅推前端不会让新故事上线。发布未获批准，不上传、切换、停止生产或操作玩家。

玩家领取新固定ref后，不得直接回退到不认识该ref的2746旧后端。可以回退前端，后端须保留本固定定义与旧ref可读合同；停止新开始需保留definition再以原registry enabled过滤（本轮已在本地fixture验证，非新增生产开关）。本轮不自动迁移、删除或恢复存档。
