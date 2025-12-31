雲ベースの地球観測データ解析基盤における JavaScript API の技術的比較と応用：JAXA Earth API および Google Earth Engine の統合的分析地球観測（EO）データの指数関数的な増加と、それに伴う計算リソースの需要拡大は、地理空間情報の解析手法を根本から変革させた。従来のデータ配布形態であった「ダウンロード後にローカル環境で処理する」というワークフローは、ペタバイト規模のアーカイブをクラウド上で直接処理する「データ近接型解析」へと移行している。この変革を象徴する二つの主要なプラットフォームが、Google Earth Engine（GEE）と JAXA Earth API である。両者は共に JavaScript API を提供しており、ブラウザベースでの高度な解析と可視化を可能にしているが、その設計思想、データ構造、および実装アプローチには顕著な差異が存在する。本報告書では、これら二つの API について、コードの具体例を交えた詳細な利用方法、利用可能なデータカタログ、およびデータ取得・処理のメカニズムについて、専門的な見地から網羅的な調査と分析を行う。Google Earth Engine JavaScript API の設計哲学と機能構造 Google Earth Engine は、地球規模の環境変化を監視し、科学的な洞察を得るために設計されたクラウドコンピューティングプラットフォームである 1。その JavaScript API は、Google の計算インフラストラクチャに対する指示を記述するためのインターフェースとして機能する 3。サーバーサイド・プロキシ・コンピューティングの概念 GEE JavaScript API を理解する上でもっとも重要な概念は、クライアントサイド（ブラウザ）の JavaScript と、サーバーサイドの Earth Engine（ee）オブジェクトの分離である 5。開発者が記述するコードの多くは、実際には Google のサーバー上で実行される計算グラフの定義であり、ローカルマシンの性能に依存せず、数千台のプロセッサを用いた並列計算を可能にする 1。このアーキテクチャにより、全球規模の平均値算出や数十年分の時系列解析を、数秒から数分で完了させることができる 2。主要なデータ構造は、地球観測データの論理的な単位に基づいて構成されている。データ構造物理的実体主な JavaScript クラス説明ラスタデータ単一の画像 ee.Image 複数のバンド（波長帯）とメタデータ（プロパティ）を持つ。画像コレクション時系列・空間的な画像群 ee.ImageCollection 検索、フィルタリング、統計処理の基本単位。ベクタデータ地形、境界、点 ee.Feature 幾何形状（Geometry）と属性辞書を持つ。地物コレクション地物の集合 ee.FeatureCollection 空間統計や空間検索に使用されるテーブルデータ。空間計算幾何演算 ee.Geometry 点、線、ポリゴンなどの空間定義。3 インタラクティブ開発環境（Code Editor）GEE の JavaScript API は、専用の Web ベース統合開発環境（IDE）である「Code Editor」を通じて提供される 3。この環境には、スクリプトエディタ、地図可視化パネル、実行結果を確認するコンソール、およびアセットマネージャが統合されている 7。Code Editor を利用する最大の利点は、解析結果を即座に地図上に投影できることである。Map.addLayer() 関数を用いることで、計算結果のピクセルデータをタイル状にオンデマンドでレンダリングし、複雑な空間演算の結果を直感的に確認することが可能となる 7。また、アセットマネージャを使用すれば、ユーザー独自の GeoTIFF や Shapefile をクラウドにアップロードし、GEE の公開カタログと組み合わせて解析できる 8。JAXA Earth API JavaScript 版のアーキテクチャと実装 JAXA Earth API は、宇宙航空研究開発機構（JAXA）が提供する、衛星観測データを Web 標準の技術で配信するためのサービスである 13。GEE が広範な計算プラットフォームであるのに対し、JAXA Earth API は「データのアクセシビリティ」と「クライアントサイドでの軽量かつ高度な可視化・解析」を重視している 13。COG と STAC による標準化されたデータ配信 JAXA Earth API の核心的な技術は、Cloud Optimized GeoTIFF (COG) と SpatioTemporal Asset Catalog (STAC) の採用にある 13。COG は、クラウド環境での効率的なアクセスに最適化された TIFF 形式であり、ピラミッド構造のタイルデータと内部インデックスを持つ 14。これにより、API は HTTP Range Request を用いて、ブラウザが必要とする特定の地域（BBOX）と解像度のデータのみをサーバーから部分的に取得できる 14。STAC は、衛星データのメタデータ（観測日時、空間範囲、センサー特性など）を JSON 形式で記述する標準規格である 13。JAXA Earth API では、この STAC を静的に実装することで、検索の高速化と、マシンリーダブルなカタログ情報の提供を実現している 14。SDK の導入と対話型実行環境 JAXA Earth API for JavaScript（SDK）は、ブラウザアプリケーションに組み込むためのライブラリとして提供される。現在の最新バージョンは 1.2.3 であり、jaxa.earth.umd.js を読み込むことで利用可能となる 16。この API の特徴の一つは、対話型の JavaScript ノートブック環境である「Observable」上で多くのサンプルが公開されている点である 13。これにより、開発者は環境構築を行うことなく、ブラウザ上で直接コードを修正し、JAXA のデータを活用した可視化手法を試行錯誤することができる 18。Google Earth Engine におけるデータ取得と処理の実装 GEE での解析は、データの読み込み、フィルタリング、演算、および可視化という一連の関数チェーンによって記述される 5。データ読み込みと空間・時間フィルタリング解析の第一歩は、大規模な ImageCollection から、目的のデータセット、期間、および地域を抽出することである。JavaScript// Sentinel-2 地表反射率データの読み込み
var sentinel2 = ee.ImageCollection('COPERNICUS/S2_SR')
// 時間フィルタ：2023 年の 1 年間に限定
.filterDate('2023-01-01', '2023-12-31')
// 空間フィルタ：特定の座標を含む画像のみを選択
.filterBounds(ee.Geometry.Point([139.767, 35.681]))
// メタデータフィルタ：雲量が 10%未満のものを選択
.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10));

// 結果の数を確認
print('Filtered Image count:', sentinel2.size()); [5, 12, 21, 23, 24]
NDVI（正規化差植生指数）の算出と可視化取得した画像群（ImageCollection）に対して、数学的な演算を一括で適用することが可能である。NDVI の算出には、近赤外（NIR）と赤（Red）のバンドを使用する。$$NDVI = \frac{NIR - RED}{NIR + RED}$$GEE では、normalizedDifference() メソッドを用いることで、この数式を簡潔に記述できる。JavaScript// 期間中の画像の中間値を採用してコンポジット画像を作成
var composite = sentinel2.median();

// Sentinel-2 の場合、B8(NIR)と B4(Red)を使用
var ndvi = composite.normalizedDifference().rename('NDVI');

// 可視化パラメータの設定
var ndviVis = {
min: 0,
max: 0.8,
palette:
};

Map.centerObject(composite, 12);
Map.addLayer(ndvi, ndviVis, 'Vegetation Index'); [12, 25, 26, 27, 28]
統計情報の抽出（Region Reduction）特定の地域（ポリゴン内など）のピクセル値を集計し、数値として抽出するには reduceRegion を使用する。これは、ラスタデータを非空間的な統計データへと変換するプロセスの中心となるものである 26。JavaScriptvar meanNDVI = ndvi.reduceRegion({
reducer: ee.Reducer.mean(),
geometry: regionGeometry, // 事前に描画またはインポートしたポリゴン
scale: 10, // 10 メートル解像度で計算
maxPixels: 1e9 // 許容最大ピクセル数
});

print('Regional Mean NDVI:', meanNDVI.get('NDVI')); [26, 29, 30, 31]
JAXA Earth API におけるデータ取得と数値解析の実装 JAXA Earth API JavaScript 版は、非同期処理（async/await）を多用し、ブラウザ上でピクセルデータを直接操作するためのメソッドを提供している 19。基本的な数値データの取得（je.getImage）je.getImage 関数は、STAC のコレクション URL を指定し、指定した緯度経度範囲（BBOX）とピクセル解像度に基づいてデータを取得する 19。JavaScript// JAXA ALOS 3D 標高データ(AW3D30)の取得
const img = await je.getImage({
collection: "https://s3.ap-northeast-1.wasabisys.com/je-pds/cog/v1/JAXA.EORC_ALOS.PRISM_AW3D30.v3.2_global/collection.json",
bbox: [138.7, 35.3, 138.8, 35.4], // [西, 南, 東, 北]
width: 512, // 取得画像の幅(pixel)
height: 512, // 取得画像の高さ(pixel)
bilinearResampling: true // 数値解析用の線形補間を有効化
}); [19, 20, 32, 33, 34]
ピクセル配列の操作とカスタムレンダリング取得した img オブジェクトからは、getData() メソッドを通じて数値配列（通常は Float32Array）を抽出できる。これにより、ブラウザの Canvas API と組み合わせて、独自の影付け処理（Hillshade）や等高線の描画をリアルタイムで実行することが可能である 19。JavaScriptconst dataObj = img.getData();
const rawData = dataObj.data; // 全ピクセルの標高値が含まれる 1 次元配列

// 地表面の傾斜を計算し、陰影起伏図を作成する例
for (let j = 1; j < height - 1; j++) {
for (let i = 1; i < width - 1; i++) {
const idx = j \* width + i;
const diff_ns = rawData[idx + width] - rawData[idx - width]; // 南北の標高差
// 標高差に基づく RGB 値の計算と Canvas への描画ロジック...
}
} [19, 33, 34]
地図ライブラリ（OpenLayers/Leaflet）との統合 JAXA Earth API は、それ自体が地図エンジンを持つわけではなく、OpenLayers や Leaflet といった既存のライブラリにレイヤーとしてデータを提供する形式をとる 17。je.ol.createLayer() や je.leaflet.createLayer() を用いることで、COG から動的にタイルを生成し、背景地図上に重ねて表示できる 17。利用可能なデータカタログと比較両プラットフォームは、その提供主体やミッションの特性に応じて異なるデータセットを保持している。GEE は米国および欧州の主要な衛星アーカイブを網羅しており、JAXA Earth API は日本独自の高精度なプロダクトを提供している 13。Google Earth Engine の主要データセット GEE のカタログは、数百テラバイトにおよぶ公開データから構成されている。これらは、アセット ID を通じて直接スクリプト内で呼び出すことが可能である 3。データセット名アセット ID 例物理量・解像度更新頻度 Landsat 8/9 Level 2LANDSAT/LC08/C02/T1_L2 地表反射率(30m)16 日間隔 Sentinel-2 MSI SRCOPERNICUS/S2_SR 地表反射率(10-20m)5 日間隔 Sentinel-1 SAR GRDCOPERNICUS/S1_GRD 後方散乱係数(10m)6-12 日間隔 MODIS NDVIMODIS/006/MOD13A1 植生指数(500m)16 日合成 GPM PrecipitationNASA/GPM_L3/IMERG_V06 降水量(0.1 度)30 分間隔 SRTM Digital ElevationUSGS/SRTMGL1_003 標高(30m)固定 35JAXA Earth API の主要プロダクト JAXA の API では、特に日本の技術が強みを持つ、高精度の地形、気象、および海洋データが提供されている 13。プロダクト名内容解像度特徴 AW3D30 (Global DSM)全球数値表層モデル 30m5m メッシュ版をベースにした高精度地形 GSMaP 全球衛星降水マップ 0.1 度毎時の降水分布。災害監視に多用される GCOM-C LST 地表面温度 250m / 5km「しきさい」衛星による高頻度観測 GCOM-C CHLA クロロフィル a 濃度 250m / 5km 海洋環境モニタリング用 ALOS-2 PALSAR-2 レーダー画像各種夜間・雲天時でも地表を観測可能 Land Cover Class 土地被覆分類図 300m 全球の土地利用状況を把握 13 データの取得とエクスポート手法の技術的詳細解析結果を外部の GIS ソフトウェア（QGIS, ArcGIS など）やローカル環境で活用するためには、適切なエクスポート処理が必要である 42。GEE からの永続的なエクスポート GEE では、解析結果の保存は「タスク（Task）」として非同期に実行される 42。これには、Google Drive への保存、Cloud Storage へのアップロード、あるいは GEE 内のプライベートアセットへの登録が含まれる 42。ラスタのエクスポート: Export.image.toDrive() を使用する。ピクセル解像度（scale）の指定が必須であり、maxPixels を設定することで、デフォルトの 1 億ピクセル制限を超えて大規模なデータを出力できる 42。ベクタ/テーブルのエクスポート: Export.table.toDrive() を使用し、CSV や Shapefile、GeoJSON 形式で出力する 45。複数の結果を一括でエクスポートする場合、merge() や flatten() を用いて一つの FeatureCollection にまとめることが効率的である 48。JAXA Earth API におけるデータ抽出 JAXA Earth API は、現在の実装ではバッチ式のエクスポート機能を持たず、ブラウザのランタイム上でデータを扱う 15。そのため、データ取得のワークフローは以下のようになる。je.getImage で必要な範囲のデータを BBOX 指定でメモリ上に読み込む。数値配列（TypedArray）を加工し、必要に応じて Blob オブジェクトを生成してクライアント側でファイルとしてダウンロードさせる 49。あるいは、API が生成した canvas 要素から toDataURL() を用いて画像として保存する 19。高度な地理空間分析のための技術的洞察これら二つの API を使い分ける、あるいは組み合わせて活用するための戦略的な視点を提供する。性能の最適化とベストプラクティス GEE においては、クライアントサイドのループ処理（for 文）を避け、可能な限り map() 関数を用いたサーバーサイド処理に置き換えることが推奨される 6。クライアントサイドの print() や getInfo() をループ内で呼び出すと、各ステップでブラウザと Google サーバー間の通信が発生し、パフォーマンスが著しく低下するからである 5。また、複雑なベクタ境界を用いたクリッピング（clip()）は計算コストが高いため、必要最小限の範囲に留めるか、clipToCollection() を検討すべきである 6。JAXA Earth API においては、リクエストする画像の「幅（width）」と「高さ（height）」を、表示するディスプレイの解像度や解析に必要なサンプリング密度に合わせて適切に設定することが重要である 19。過度に大きな値を設定すると、ブラウザのメモリを圧迫し、レンダリングの遅延を招く 32。統合的なユースケース：災害監視と環境変動 GEE と JAXA データを組み合わせた解析は、極めて強力な洞察を生む。例えば、JAXA の「GSMaP」で豪雨地域を特定し、その座標を GEE のスクリプトに渡して Sentinel-1 の SAR データで浸水範囲を抽出するというフローが考えられる 38。JAXA Earth API では、ALOS-2 PALSAR-2 の緊急観測データが公開される場合があり、これは災害発生直後の迅速な状況把握に役立つ 39。一方、GEE は過去数十年の Landsat データを保持しているため、災害発生前の長期的な地表面の変化や、復旧過程のモニタリングにおいて無類の強みを発揮する 2。結論と今後の展望本報告書で詳述した通り、Google Earth Engine JavaScript API と JAXA Earth API は、それぞれ補完的な役割を果たしている。GEE は、グローバル規模の歴史的なアーカイブを並列処理するための強力なエンジンを提供し、JAXA Earth API は、高精度な最新の観測プロダクトを Web 標準の COG/STAC 形式で提供することで、現代的な Web GIS アプリケーションの構築を容易にしている。開発者は、大規模な統計解析や時系列変化の抽出には GEE を主軸とし、特定地域の精密な標高解析や、日本周辺の高頻度な気象・海洋環境モニタリングには JAXA Earth API を活用するという「ハイブリッド・アプローチ」をとることが最適である。これらの API を習熟することは、単なるツール操作を超えて、地球規模の課題（気候変動、災害、資源管理）に対してデータ駆動型の解を導き出すための、現代的な地球観測解析者の必須要件となっている。クラウドネイティブな地球観測の時代において、JavaScript を通じた解析の自動化と可視化は、今後さらにその重要性を増していくであろう。
