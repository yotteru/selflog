# GitHub でメールアドレスを公開しない

コミットには作者のメールアドレスが記録され、公開リポジトリでは誰でも見られる。
GitHub が用意する noreply アドレス（`208667756+yotteru@users.noreply.github.com`）を使えば、個人のアドレスは出ない。

## 1. GitHub の設定（これからのコミットを守る）

1. GitHub 右上のアイコン → **Settings** → 左の **Emails**。
2. **Keep my email addresses private** にチェック。
   - GitHub の画面から行う操作（Web での編集、PR のマージなど）は、noreply アドレスで記録されるようになる。
   - 画面に noreply アドレスが表示される（`208667756+yotteru@users.noreply.github.com`）。
3. **Block command line pushes that expose my email** にチェック。
   - 個人のアドレスが入ったコミットを push しようとすると、GitHub が拒否してくれる（うっかり防止）。

## 2. 自分の PC の git の設定（これからのコミットを守る）

Windows の PowerShell で：

```powershell
git config --global user.email "208667756+yotteru@users.noreply.github.com"
```

確認：

```powershell
git config --global user.email
```

→ noreply アドレスが出れば OK。

## 3. すでにあるコミット（過去の履歴）

1と2は**これからのコミット**にしか効かない。すでに公開された履歴に残っているアドレスは消えない。
消すには、履歴を書き換えて作者欄を noreply にし、強制 push する必要がある。

### selflog
**済み**：履歴を書き換えて作者欄を noreply にし、強制 push したうえで公開した。以後のコミットも noreply だけを使う（[CLAUDE.md](../CLAUDE.md)）。

### shiori
**済み**：履歴を書き換えて作者欄を noreply にし、強制 push した。GitHub Support への削除依頼はしない（利用者の判断）。そのため次のことは残る：

- すでに誰かが clone・fork・アーカイブしたものからは消せない。
- GitHub 上では、書き換える前のコミットが ID 指定でしばらく見られることがある。完全に消すには GitHub Support に削除を依頼する（Settings の「Contact support」から、リポジトリ名と古いコミットの削除依頼を送る）。
- 公開されていた期間があるので、そのアドレスに迷惑メールが届く可能性は残る。気になるなら、GitHub 用には別のアドレスを使う。
