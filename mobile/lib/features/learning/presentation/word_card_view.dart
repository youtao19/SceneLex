import 'package:flutter/material.dart';

import '../data/learning_models.dart';

/// 词卡的完整教学内容：揭晓后、查词结果和历史详情共用一份渲染。
class WordCardView extends StatelessWidget {
  const WordCardView({super.key, required this.meanings});

  final List<WordMeaning> meanings;

  @override
  Widget build(BuildContext context) {
    if (meanings.isEmpty) {
      return const Text('这个词还没有可显示的释义。');
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final meaning in meanings) ...[
          Text(
            '${meaning.partOfSpeech} ${meaning.meaning}'.trim(),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          if (meaning.sceneTitle.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                meaning.sceneTitle,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          if (meaning.explanation.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(meaning.explanation),
            ),
          for (final example in meaning.examples)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('· $example'),
            ),
          if (meaning.tip.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '用法：${meaning.tip}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          const Divider(height: 24),
        ],
      ],
    );
  }
}
