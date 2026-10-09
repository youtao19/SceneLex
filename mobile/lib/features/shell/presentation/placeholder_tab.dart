import 'package:flutter/material.dart';

/// 还没实现的功能只放这句说明：不能让脚手架看起来像能用的入口。
class PlaceholderTab extends StatelessWidget {
  const PlaceholderTab({super.key, required this.title, required this.note});

  final String title;
  final String note;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.construction_outlined,
                  size: 48,
                  color: Theme.of(context).colorScheme.outline,
                ),
                const SizedBox(height: 16),
                Text(note, textAlign: TextAlign.center),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
