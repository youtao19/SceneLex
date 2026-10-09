import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../data/words_api.dart';

/// 词库列表放在功能级：详情页改名/删除后要能失效它，
/// 否则返回列表时还是旧名字（页面在导航栈里没被销毁，缓存不会自动刷新）。
final systemBooksProvider = FutureProvider.autoDispose<List<SystemBook>>((ref) {
  return ref.watch(wordsApiProvider).fetchSystemBooks();
});

final wordBooksProvider = FutureProvider.autoDispose<List<WordBook>>((ref) {
  return ref.watch(wordsApiProvider).fetchWordBooks();
});
