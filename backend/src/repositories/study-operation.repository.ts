import type { PoolClient } from 'pg';
import { query } from '../config/database';
import type { ReviewSnapshot, StoredWord } from '../types/word';

export type StudyOperationKind = 'review' | 'complete_new' | 'rollback';

export interface StudyOperation {
  id: number;
  operationId: string;
  kind: StudyOperationKind;
  wordId: number | null;
  requestFingerprint: string;
  beforeState: ReviewSnapshot | null;
  result: StoredWord;
  studyVersion: number;
}

interface StudyOperationRow {
  id: string;
  operation_id: string;
  kind: string;
  word_id: string | null;
  request_fingerprint: string;
  before_state: ReviewSnapshot | null;
  result: StoredWord;
  study_version: number;
}

function mapOperationRow(row: StudyOperationRow): StudyOperation {
  return {
    id: Number(row.id),
    operationId: row.operation_id,
    kind: row.kind as StudyOperationKind,
    wordId: row.word_id === null ? null : Number(row.word_id),
    requestFingerprint: row.request_fingerprint,
    beforeState: row.before_state,
    result: row.result,
    studyVersion: Number(row.study_version),
  };
}

/**
 * 操作回执按用户隔离：别的用户拿到同一个 operationId 也不能读到或顶替这条记录。
 */
export async function findStudyOperation(
  userId: number,
  operationId: string,
): Promise<StudyOperation | null> {
  const result = await query<StudyOperationRow>(
    `
      SELECT
        id,
        operation_id,
        kind,
        word_id,
        request_fingerprint,
        before_state,
        result,
        study_version
      FROM study_operations
      WHERE user_id = $1
        AND operation_id = $2
    `,
    [userId, operationId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapOperationRow(result.rows[0]);
}

/**
 * 回执必须和排期写入在同一个事务里，否则会出现“排期改了但查不到回执”，
 * 客户端重试时就会重复执行。
 */
export async function insertStudyOperation(
  client: PoolClient,
  input: {
    userId: number;
    operationId: string;
    kind: StudyOperationKind;
    wordId: number;
    requestFingerprint: string;
    beforeState: ReviewSnapshot | null;
    result: StoredWord;
    studyVersion: number;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO study_operations (
        user_id,
        operation_id,
        kind,
        word_id,
        request_fingerprint,
        before_state,
        result,
        study_version
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
      ON CONFLICT (user_id, operation_id) DO NOTHING
    `,
    [
      input.userId,
      input.operationId,
      input.kind,
      input.wordId,
      input.requestFingerprint,
      input.beforeState === null ? null : JSON.stringify(input.beforeState),
      JSON.stringify(input.result),
      input.studyVersion,
    ],
  );
}
