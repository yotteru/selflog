-- 残量アプリ（zanryo）: 利用者を登録する
-- このアプリを使えるのは、ここに登録したユーザーだけ（shiori のユーザーは使えない）。
--
-- <USER_ID> を、Authentication → Users に出ている自分の UID に置き換えて実行する。
-- shiori と同じメールアドレスでログインするなら、shiori で使っているユーザーと同じ UID になる。

insert into zanryo_private.members (user_id, note)
values ('<USER_ID>', '自分')
on conflict (user_id) do nothing;

-- 確認
select m.user_id, u.email, m.note, m.created_at
from zanryo_private.members m
join auth.users u on u.id = m.user_id;
