# Tab Memory Purge
Google Chrome用のタブ拡張機能です。  

設定した条件にそって、使用していないタブのメモリを解放します。  

## 設定可能項目
- 解放時に使用するページ
- 非アクティブのタブをアンロードする時間
    - 前回アクティブになった時間から設定した時間が過ぎると、メモリを解放します。
- 除外するアドレス(正規表現対応)
    - 動作対象外のサイトを指定できます。
- 各操作のキーバインド
- その他
    - その他の細かい項目を設定できます。
    
## 簡単な仕様
- タブごとにsetIntervalを設定し、指定したアンロード時間ごとにアンロードするか否かを判断。
- タブをアクティブにすると、時間はリセット。
- アンロードする場合、空ページを読み込み、メモリを解放します。
- 現在のタブが除外リストに追加されているかどうかでツールバーのアイコンが変化します。
    - ![赤×](https://raw.githubusercontent.com/electron226/Tab-Memory-Purge/master/icon/icon_019_use_exclude.png) = ユーザが指定した除外リストにマッチ
    - ![黄×](https://raw.githubusercontent.com/electron226/Tab-Memory-Purge/master/icon/icon_019_extension_exclude.png) = 拡張機能内で固定された除外リストにマッチ
    - ![緑×](https://raw.githubusercontent.com/electron226/Tab-Memory-Purge/master/icon/icon_019_temp_exclude.png) = 一時的な除外リストにマッチ
    - ![なにもなし](https://raw.githubusercontent.com/electron226/Tab-Memory-Purge/master/icon/icon_019.png) = どの除外リストにもマッチしませんでした。
- ブラウザアクションのアイコンに現在、解放しているタブの数を表示します。