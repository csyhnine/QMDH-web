# 移除台账信息（2026-10-29）

按用户“去掉，没意义”的要求，移除页头台账信息按钮、编辑弹窗、保存处理、草稿及无用的独立 reports/year 读取。页面底部和 Excel 导出不再显示表格编制/数据更新日期，导出仍保留范围、年度项目、经营统计与人员周报。数据库历史字段和接口保留，不删除数据，不改分院权限或项目排期。

26 管理定向测试、2 目标类型文件零新增诊断、890 模块构建通过；最终包三主视图/人员池返回及名称键盘编辑4场通过，补查无台账信息入口/底部信息及独立 reports 请求，pageerror=[]。导出结构由既有工作簿测试覆盖，不代表整套 CI 或独立验收。候选与私有证据在忽略目录 `local/remove-report-meta-20261029/`，未触发生产测试写入、真实 GPU 或付费生成。

新发布目录 `/opt/qmdh-frp/releases/remove-report-meta-20261029`，镜像标签 `qmdh-remove-report-meta-frontend:20261029`；配对备份 `/www/backup/qmdh-release-20261029-remove-report-meta` ↔ `E:/backups/QMDH-web/release-20261029-remove-report-meta`。纯前端 overlay，保留旧 hash 资源；DB/媒体继承旧恢复链、unit-access独立快照及本机基础包，非新快照，回滚不覆盖新业务数据。无清理、迁移、后端修改。既有WIP保留，原分支，PR #5不合并。实际发布结果随后补记。
