-- 残量アプリ（zanryo）: すべて削除する
-- このアプリのデータと関数を消す。shiori のテーブル・ユーザー（auth.users）には影響しない。
-- ※ 元に戻せない。記録もすべて消える。
--
-- Edge Function（zanryo-widget-summary / zanryo-estimate-nutrition）と
-- シークレット（ZANRYO_ で始まるもの）は、ダッシュボードから別に消す。
-- Data API の Exposed schemas から zanryo を外すのも忘れずに。

drop schema if exists zanryo cascade;
drop schema if exists zanryo_private cascade;
