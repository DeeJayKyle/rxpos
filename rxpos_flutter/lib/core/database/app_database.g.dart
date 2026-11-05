// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $RecordsTable extends Records with TableInfo<$RecordsTable, RecordRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RecordsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _tMeta = const VerificationMeta('t');
  @override
  late final GeneratedColumn<String> t = GeneratedColumn<String>(
    't',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _jsonMeta = const VerificationMeta('json');
  @override
  late final GeneratedColumn<String> json = GeneratedColumn<String>(
    'json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<String> updatedAt = GeneratedColumn<String>(
    'updated_at',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [t, id, json, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'records';
  @override
  VerificationContext validateIntegrity(
    Insertable<RecordRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('t')) {
      context.handle(_tMeta, t.isAcceptableOrUnknown(data['t']!, _tMeta));
    } else if (isInserting) {
      context.missing(_tMeta);
    }
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('json')) {
      context.handle(
        _jsonMeta,
        json.isAcceptableOrUnknown(data['json']!, _jsonMeta),
      );
    } else if (isInserting) {
      context.missing(_jsonMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {t, id};
  @override
  RecordRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return RecordRow(
      t: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}t'],
      )!,
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      json: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}json'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}updated_at'],
      ),
    );
  }

  @override
  $RecordsTable createAlias(String alias) {
    return $RecordsTable(attachedDatabase, alias);
  }
}

class RecordRow extends DataClass implements Insertable<RecordRow> {
  final String t;
  final String id;
  final String json;
  final String? updatedAt;
  const RecordRow({
    required this.t,
    required this.id,
    required this.json,
    this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['t'] = Variable<String>(t);
    map['id'] = Variable<String>(id);
    map['json'] = Variable<String>(json);
    if (!nullToAbsent || updatedAt != null) {
      map['updated_at'] = Variable<String>(updatedAt);
    }
    return map;
  }

  RecordsCompanion toCompanion(bool nullToAbsent) {
    return RecordsCompanion(
      t: Value(t),
      id: Value(id),
      json: Value(json),
      updatedAt: updatedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(updatedAt),
    );
  }

  factory RecordRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return RecordRow(
      t: serializer.fromJson<String>(json['t']),
      id: serializer.fromJson<String>(json['id']),
      json: serializer.fromJson<String>(json['json']),
      updatedAt: serializer.fromJson<String?>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      't': serializer.toJson<String>(t),
      'id': serializer.toJson<String>(id),
      'json': serializer.toJson<String>(json),
      'updatedAt': serializer.toJson<String?>(updatedAt),
    };
  }

  RecordRow copyWith({
    String? t,
    String? id,
    String? json,
    Value<String?> updatedAt = const Value.absent(),
  }) => RecordRow(
    t: t ?? this.t,
    id: id ?? this.id,
    json: json ?? this.json,
    updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,
  );
  RecordRow copyWithCompanion(RecordsCompanion data) {
    return RecordRow(
      t: data.t.present ? data.t.value : this.t,
      id: data.id.present ? data.id.value : this.id,
      json: data.json.present ? data.json.value : this.json,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('RecordRow(')
          ..write('t: $t, ')
          ..write('id: $id, ')
          ..write('json: $json, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(t, id, json, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RecordRow &&
          other.t == this.t &&
          other.id == this.id &&
          other.json == this.json &&
          other.updatedAt == this.updatedAt);
}

class RecordsCompanion extends UpdateCompanion<RecordRow> {
  final Value<String> t;
  final Value<String> id;
  final Value<String> json;
  final Value<String?> updatedAt;
  final Value<int> rowid;
  const RecordsCompanion({
    this.t = const Value.absent(),
    this.id = const Value.absent(),
    this.json = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  RecordsCompanion.insert({
    required String t,
    required String id,
    required String json,
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : t = Value(t),
       id = Value(id),
       json = Value(json);
  static Insertable<RecordRow> custom({
    Expression<String>? t,
    Expression<String>? id,
    Expression<String>? json,
    Expression<String>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (t != null) 't': t,
      if (id != null) 'id': id,
      if (json != null) 'json': json,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  RecordsCompanion copyWith({
    Value<String>? t,
    Value<String>? id,
    Value<String>? json,
    Value<String?>? updatedAt,
    Value<int>? rowid,
  }) {
    return RecordsCompanion(
      t: t ?? this.t,
      id: id ?? this.id,
      json: json ?? this.json,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (t.present) {
      map['t'] = Variable<String>(t.value);
    }
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (json.present) {
      map['json'] = Variable<String>(json.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<String>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RecordsCompanion(')
          ..write('t: $t, ')
          ..write('id: $id, ')
          ..write('json: $json, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $TombstonesTable extends Tombstones
    with TableInfo<$TombstonesTable, TombstoneRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TombstonesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _tMeta = const VerificationMeta('t');
  @override
  late final GeneratedColumn<String> t = GeneratedColumn<String>(
    't',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _atMeta = const VerificationMeta('at');
  @override
  late final GeneratedColumn<String> at = GeneratedColumn<String>(
    'at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [t, id, at];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'tombstones';
  @override
  VerificationContext validateIntegrity(
    Insertable<TombstoneRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('t')) {
      context.handle(_tMeta, t.isAcceptableOrUnknown(data['t']!, _tMeta));
    } else if (isInserting) {
      context.missing(_tMeta);
    }
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('at')) {
      context.handle(_atMeta, at.isAcceptableOrUnknown(data['at']!, _atMeta));
    } else if (isInserting) {
      context.missing(_atMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {t, id};
  @override
  TombstoneRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return TombstoneRow(
      t: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}t'],
      )!,
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      at: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}at'],
      )!,
    );
  }

  @override
  $TombstonesTable createAlias(String alias) {
    return $TombstonesTable(attachedDatabase, alias);
  }
}

class TombstoneRow extends DataClass implements Insertable<TombstoneRow> {
  final String t;
  final String id;
  final String at;
  const TombstoneRow({required this.t, required this.id, required this.at});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['t'] = Variable<String>(t);
    map['id'] = Variable<String>(id);
    map['at'] = Variable<String>(at);
    return map;
  }

  TombstonesCompanion toCompanion(bool nullToAbsent) {
    return TombstonesCompanion(t: Value(t), id: Value(id), at: Value(at));
  }

  factory TombstoneRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return TombstoneRow(
      t: serializer.fromJson<String>(json['t']),
      id: serializer.fromJson<String>(json['id']),
      at: serializer.fromJson<String>(json['at']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      't': serializer.toJson<String>(t),
      'id': serializer.toJson<String>(id),
      'at': serializer.toJson<String>(at),
    };
  }

  TombstoneRow copyWith({String? t, String? id, String? at}) =>
      TombstoneRow(t: t ?? this.t, id: id ?? this.id, at: at ?? this.at);
  TombstoneRow copyWithCompanion(TombstonesCompanion data) {
    return TombstoneRow(
      t: data.t.present ? data.t.value : this.t,
      id: data.id.present ? data.id.value : this.id,
      at: data.at.present ? data.at.value : this.at,
    );
  }

  @override
  String toString() {
    return (StringBuffer('TombstoneRow(')
          ..write('t: $t, ')
          ..write('id: $id, ')
          ..write('at: $at')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(t, id, at);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TombstoneRow &&
          other.t == this.t &&
          other.id == this.id &&
          other.at == this.at);
}

class TombstonesCompanion extends UpdateCompanion<TombstoneRow> {
  final Value<String> t;
  final Value<String> id;
  final Value<String> at;
  final Value<int> rowid;
  const TombstonesCompanion({
    this.t = const Value.absent(),
    this.id = const Value.absent(),
    this.at = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  TombstonesCompanion.insert({
    required String t,
    required String id,
    required String at,
    this.rowid = const Value.absent(),
  }) : t = Value(t),
       id = Value(id),
       at = Value(at);
  static Insertable<TombstoneRow> custom({
    Expression<String>? t,
    Expression<String>? id,
    Expression<String>? at,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (t != null) 't': t,
      if (id != null) 'id': id,
      if (at != null) 'at': at,
      if (rowid != null) 'rowid': rowid,
    });
  }

  TombstonesCompanion copyWith({
    Value<String>? t,
    Value<String>? id,
    Value<String>? at,
    Value<int>? rowid,
  }) {
    return TombstonesCompanion(
      t: t ?? this.t,
      id: id ?? this.id,
      at: at ?? this.at,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (t.present) {
      map['t'] = Variable<String>(t.value);
    }
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (at.present) {
      map['at'] = Variable<String>(at.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TombstonesCompanion(')
          ..write('t: $t, ')
          ..write('id: $id, ')
          ..write('at: $at, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $OutboxTable extends Outbox with TableInfo<$OutboxTable, OutboxRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OutboxTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _seqMeta = const VerificationMeta('seq');
  @override
  late final GeneratedColumn<int> seq = GeneratedColumn<int>(
    'seq',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _opMeta = const VerificationMeta('op');
  @override
  late final GeneratedColumn<String> op = GeneratedColumn<String>(
    'op',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'),
  );
  static const VerificationMeta _txnMeta = const VerificationMeta('txn');
  @override
  late final GeneratedColumn<String> txn = GeneratedColumn<String>(
    'txn',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tMeta = const VerificationMeta('t');
  @override
  late final GeneratedColumn<String> t = GeneratedColumn<String>(
    't',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _deletedMeta = const VerificationMeta(
    'deleted',
  );
  @override
  late final GeneratedColumn<bool> deleted = GeneratedColumn<bool>(
    'deleted',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("deleted" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _atMeta = const VerificationMeta('at');
  @override
  late final GeneratedColumn<String> at = GeneratedColumn<String>(
    'at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [seq, op, txn, t, id, deleted, at];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'outbox';
  @override
  VerificationContext validateIntegrity(
    Insertable<OutboxRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('seq')) {
      context.handle(
        _seqMeta,
        seq.isAcceptableOrUnknown(data['seq']!, _seqMeta),
      );
    }
    if (data.containsKey('op')) {
      context.handle(_opMeta, op.isAcceptableOrUnknown(data['op']!, _opMeta));
    } else if (isInserting) {
      context.missing(_opMeta);
    }
    if (data.containsKey('txn')) {
      context.handle(
        _txnMeta,
        txn.isAcceptableOrUnknown(data['txn']!, _txnMeta),
      );
    } else if (isInserting) {
      context.missing(_txnMeta);
    }
    if (data.containsKey('t')) {
      context.handle(_tMeta, t.isAcceptableOrUnknown(data['t']!, _tMeta));
    } else if (isInserting) {
      context.missing(_tMeta);
    }
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('deleted')) {
      context.handle(
        _deletedMeta,
        deleted.isAcceptableOrUnknown(data['deleted']!, _deletedMeta),
      );
    }
    if (data.containsKey('at')) {
      context.handle(_atMeta, at.isAcceptableOrUnknown(data['at']!, _atMeta));
    } else if (isInserting) {
      context.missing(_atMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {seq};
  @override
  OutboxRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return OutboxRow(
      seq: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}seq'],
      )!,
      op: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}op'],
      )!,
      txn: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}txn'],
      )!,
      t: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}t'],
      )!,
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      deleted: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}deleted'],
      )!,
      at: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}at'],
      )!,
    );
  }

  @override
  $OutboxTable createAlias(String alias) {
    return $OutboxTable(attachedDatabase, alias);
  }
}

class OutboxRow extends DataClass implements Insertable<OutboxRow> {
  final int seq;
  final String op;
  final String txn;
  final String t;
  final String id;
  final bool deleted;
  final String at;
  const OutboxRow({
    required this.seq,
    required this.op,
    required this.txn,
    required this.t,
    required this.id,
    required this.deleted,
    required this.at,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['seq'] = Variable<int>(seq);
    map['op'] = Variable<String>(op);
    map['txn'] = Variable<String>(txn);
    map['t'] = Variable<String>(t);
    map['id'] = Variable<String>(id);
    map['deleted'] = Variable<bool>(deleted);
    map['at'] = Variable<String>(at);
    return map;
  }

  OutboxCompanion toCompanion(bool nullToAbsent) {
    return OutboxCompanion(
      seq: Value(seq),
      op: Value(op),
      txn: Value(txn),
      t: Value(t),
      id: Value(id),
      deleted: Value(deleted),
      at: Value(at),
    );
  }

  factory OutboxRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return OutboxRow(
      seq: serializer.fromJson<int>(json['seq']),
      op: serializer.fromJson<String>(json['op']),
      txn: serializer.fromJson<String>(json['txn']),
      t: serializer.fromJson<String>(json['t']),
      id: serializer.fromJson<String>(json['id']),
      deleted: serializer.fromJson<bool>(json['deleted']),
      at: serializer.fromJson<String>(json['at']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'seq': serializer.toJson<int>(seq),
      'op': serializer.toJson<String>(op),
      'txn': serializer.toJson<String>(txn),
      't': serializer.toJson<String>(t),
      'id': serializer.toJson<String>(id),
      'deleted': serializer.toJson<bool>(deleted),
      'at': serializer.toJson<String>(at),
    };
  }

  OutboxRow copyWith({
    int? seq,
    String? op,
    String? txn,
    String? t,
    String? id,
    bool? deleted,
    String? at,
  }) => OutboxRow(
    seq: seq ?? this.seq,
    op: op ?? this.op,
    txn: txn ?? this.txn,
    t: t ?? this.t,
    id: id ?? this.id,
    deleted: deleted ?? this.deleted,
    at: at ?? this.at,
  );
  OutboxRow copyWithCompanion(OutboxCompanion data) {
    return OutboxRow(
      seq: data.seq.present ? data.seq.value : this.seq,
      op: data.op.present ? data.op.value : this.op,
      txn: data.txn.present ? data.txn.value : this.txn,
      t: data.t.present ? data.t.value : this.t,
      id: data.id.present ? data.id.value : this.id,
      deleted: data.deleted.present ? data.deleted.value : this.deleted,
      at: data.at.present ? data.at.value : this.at,
    );
  }

  @override
  String toString() {
    return (StringBuffer('OutboxRow(')
          ..write('seq: $seq, ')
          ..write('op: $op, ')
          ..write('txn: $txn, ')
          ..write('t: $t, ')
          ..write('id: $id, ')
          ..write('deleted: $deleted, ')
          ..write('at: $at')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(seq, op, txn, t, id, deleted, at);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is OutboxRow &&
          other.seq == this.seq &&
          other.op == this.op &&
          other.txn == this.txn &&
          other.t == this.t &&
          other.id == this.id &&
          other.deleted == this.deleted &&
          other.at == this.at);
}

class OutboxCompanion extends UpdateCompanion<OutboxRow> {
  final Value<int> seq;
  final Value<String> op;
  final Value<String> txn;
  final Value<String> t;
  final Value<String> id;
  final Value<bool> deleted;
  final Value<String> at;
  const OutboxCompanion({
    this.seq = const Value.absent(),
    this.op = const Value.absent(),
    this.txn = const Value.absent(),
    this.t = const Value.absent(),
    this.id = const Value.absent(),
    this.deleted = const Value.absent(),
    this.at = const Value.absent(),
  });
  OutboxCompanion.insert({
    this.seq = const Value.absent(),
    required String op,
    required String txn,
    required String t,
    required String id,
    this.deleted = const Value.absent(),
    required String at,
  }) : op = Value(op),
       txn = Value(txn),
       t = Value(t),
       id = Value(id),
       at = Value(at);
  static Insertable<OutboxRow> custom({
    Expression<int>? seq,
    Expression<String>? op,
    Expression<String>? txn,
    Expression<String>? t,
    Expression<String>? id,
    Expression<bool>? deleted,
    Expression<String>? at,
  }) {
    return RawValuesInsertable({
      if (seq != null) 'seq': seq,
      if (op != null) 'op': op,
      if (txn != null) 'txn': txn,
      if (t != null) 't': t,
      if (id != null) 'id': id,
      if (deleted != null) 'deleted': deleted,
      if (at != null) 'at': at,
    });
  }

  OutboxCompanion copyWith({
    Value<int>? seq,
    Value<String>? op,
    Value<String>? txn,
    Value<String>? t,
    Value<String>? id,
    Value<bool>? deleted,
    Value<String>? at,
  }) {
    return OutboxCompanion(
      seq: seq ?? this.seq,
      op: op ?? this.op,
      txn: txn ?? this.txn,
      t: t ?? this.t,
      id: id ?? this.id,
      deleted: deleted ?? this.deleted,
      at: at ?? this.at,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (seq.present) {
      map['seq'] = Variable<int>(seq.value);
    }
    if (op.present) {
      map['op'] = Variable<String>(op.value);
    }
    if (txn.present) {
      map['txn'] = Variable<String>(txn.value);
    }
    if (t.present) {
      map['t'] = Variable<String>(t.value);
    }
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (deleted.present) {
      map['deleted'] = Variable<bool>(deleted.value);
    }
    if (at.present) {
      map['at'] = Variable<String>(at.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OutboxCompanion(')
          ..write('seq: $seq, ')
          ..write('op: $op, ')
          ..write('txn: $txn, ')
          ..write('t: $t, ')
          ..write('id: $id, ')
          ..write('deleted: $deleted, ')
          ..write('at: $at')
          ..write(')'))
        .toString();
  }
}

class $RejectedOpsTable extends RejectedOps
    with TableInfo<$RejectedOpsTable, RejectedRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RejectedOpsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _seqMeta = const VerificationMeta('seq');
  @override
  late final GeneratedColumn<int> seq = GeneratedColumn<int>(
    'seq',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _opMeta = const VerificationMeta('op');
  @override
  late final GeneratedColumn<String> op = GeneratedColumn<String>(
    'op',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tMeta = const VerificationMeta('t');
  @override
  late final GeneratedColumn<String> t = GeneratedColumn<String>(
    't',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _atMeta = const VerificationMeta('at');
  @override
  late final GeneratedColumn<String> at = GeneratedColumn<String>(
    'at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _reasonMeta = const VerificationMeta('reason');
  @override
  late final GeneratedColumn<String> reason = GeneratedColumn<String>(
    'reason',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [seq, op, t, id, at, reason];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'rejected_ops';
  @override
  VerificationContext validateIntegrity(
    Insertable<RejectedRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('seq')) {
      context.handle(
        _seqMeta,
        seq.isAcceptableOrUnknown(data['seq']!, _seqMeta),
      );
    }
    if (data.containsKey('op')) {
      context.handle(_opMeta, op.isAcceptableOrUnknown(data['op']!, _opMeta));
    } else if (isInserting) {
      context.missing(_opMeta);
    }
    if (data.containsKey('t')) {
      context.handle(_tMeta, t.isAcceptableOrUnknown(data['t']!, _tMeta));
    } else if (isInserting) {
      context.missing(_tMeta);
    }
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('at')) {
      context.handle(_atMeta, at.isAcceptableOrUnknown(data['at']!, _atMeta));
    } else if (isInserting) {
      context.missing(_atMeta);
    }
    if (data.containsKey('reason')) {
      context.handle(
        _reasonMeta,
        reason.isAcceptableOrUnknown(data['reason']!, _reasonMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {seq};
  @override
  RejectedRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return RejectedRow(
      seq: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}seq'],
      )!,
      op: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}op'],
      )!,
      t: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}t'],
      )!,
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      at: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}at'],
      )!,
      reason: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}reason'],
      ),
    );
  }

  @override
  $RejectedOpsTable createAlias(String alias) {
    return $RejectedOpsTable(attachedDatabase, alias);
  }
}

class RejectedRow extends DataClass implements Insertable<RejectedRow> {
  final int seq;
  final String op;
  final String t;
  final String id;
  final String at;
  final String? reason;
  const RejectedRow({
    required this.seq,
    required this.op,
    required this.t,
    required this.id,
    required this.at,
    this.reason,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['seq'] = Variable<int>(seq);
    map['op'] = Variable<String>(op);
    map['t'] = Variable<String>(t);
    map['id'] = Variable<String>(id);
    map['at'] = Variable<String>(at);
    if (!nullToAbsent || reason != null) {
      map['reason'] = Variable<String>(reason);
    }
    return map;
  }

  RejectedOpsCompanion toCompanion(bool nullToAbsent) {
    return RejectedOpsCompanion(
      seq: Value(seq),
      op: Value(op),
      t: Value(t),
      id: Value(id),
      at: Value(at),
      reason: reason == null && nullToAbsent
          ? const Value.absent()
          : Value(reason),
    );
  }

  factory RejectedRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return RejectedRow(
      seq: serializer.fromJson<int>(json['seq']),
      op: serializer.fromJson<String>(json['op']),
      t: serializer.fromJson<String>(json['t']),
      id: serializer.fromJson<String>(json['id']),
      at: serializer.fromJson<String>(json['at']),
      reason: serializer.fromJson<String?>(json['reason']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'seq': serializer.toJson<int>(seq),
      'op': serializer.toJson<String>(op),
      't': serializer.toJson<String>(t),
      'id': serializer.toJson<String>(id),
      'at': serializer.toJson<String>(at),
      'reason': serializer.toJson<String?>(reason),
    };
  }

  RejectedRow copyWith({
    int? seq,
    String? op,
    String? t,
    String? id,
    String? at,
    Value<String?> reason = const Value.absent(),
  }) => RejectedRow(
    seq: seq ?? this.seq,
    op: op ?? this.op,
    t: t ?? this.t,
    id: id ?? this.id,
    at: at ?? this.at,
    reason: reason.present ? reason.value : this.reason,
  );
  RejectedRow copyWithCompanion(RejectedOpsCompanion data) {
    return RejectedRow(
      seq: data.seq.present ? data.seq.value : this.seq,
      op: data.op.present ? data.op.value : this.op,
      t: data.t.present ? data.t.value : this.t,
      id: data.id.present ? data.id.value : this.id,
      at: data.at.present ? data.at.value : this.at,
      reason: data.reason.present ? data.reason.value : this.reason,
    );
  }

  @override
  String toString() {
    return (StringBuffer('RejectedRow(')
          ..write('seq: $seq, ')
          ..write('op: $op, ')
          ..write('t: $t, ')
          ..write('id: $id, ')
          ..write('at: $at, ')
          ..write('reason: $reason')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(seq, op, t, id, at, reason);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RejectedRow &&
          other.seq == this.seq &&
          other.op == this.op &&
          other.t == this.t &&
          other.id == this.id &&
          other.at == this.at &&
          other.reason == this.reason);
}

class RejectedOpsCompanion extends UpdateCompanion<RejectedRow> {
  final Value<int> seq;
  final Value<String> op;
  final Value<String> t;
  final Value<String> id;
  final Value<String> at;
  final Value<String?> reason;
  const RejectedOpsCompanion({
    this.seq = const Value.absent(),
    this.op = const Value.absent(),
    this.t = const Value.absent(),
    this.id = const Value.absent(),
    this.at = const Value.absent(),
    this.reason = const Value.absent(),
  });
  RejectedOpsCompanion.insert({
    this.seq = const Value.absent(),
    required String op,
    required String t,
    required String id,
    required String at,
    this.reason = const Value.absent(),
  }) : op = Value(op),
       t = Value(t),
       id = Value(id),
       at = Value(at);
  static Insertable<RejectedRow> custom({
    Expression<int>? seq,
    Expression<String>? op,
    Expression<String>? t,
    Expression<String>? id,
    Expression<String>? at,
    Expression<String>? reason,
  }) {
    return RawValuesInsertable({
      if (seq != null) 'seq': seq,
      if (op != null) 'op': op,
      if (t != null) 't': t,
      if (id != null) 'id': id,
      if (at != null) 'at': at,
      if (reason != null) 'reason': reason,
    });
  }

  RejectedOpsCompanion copyWith({
    Value<int>? seq,
    Value<String>? op,
    Value<String>? t,
    Value<String>? id,
    Value<String>? at,
    Value<String?>? reason,
  }) {
    return RejectedOpsCompanion(
      seq: seq ?? this.seq,
      op: op ?? this.op,
      t: t ?? this.t,
      id: id ?? this.id,
      at: at ?? this.at,
      reason: reason ?? this.reason,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (seq.present) {
      map['seq'] = Variable<int>(seq.value);
    }
    if (op.present) {
      map['op'] = Variable<String>(op.value);
    }
    if (t.present) {
      map['t'] = Variable<String>(t.value);
    }
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (at.present) {
      map['at'] = Variable<String>(at.value);
    }
    if (reason.present) {
      map['reason'] = Variable<String>(reason.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RejectedOpsCompanion(')
          ..write('seq: $seq, ')
          ..write('op: $op, ')
          ..write('t: $t, ')
          ..write('id: $id, ')
          ..write('at: $at, ')
          ..write('reason: $reason')
          ..write(')'))
        .toString();
  }
}

class $KvTable extends Kv with TableInfo<$KvTable, KvRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $KvTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _kMeta = const VerificationMeta('k');
  @override
  late final GeneratedColumn<String> k = GeneratedColumn<String>(
    'k',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _vMeta = const VerificationMeta('v');
  @override
  late final GeneratedColumn<String> v = GeneratedColumn<String>(
    'v',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [k, v];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'kv';
  @override
  VerificationContext validateIntegrity(
    Insertable<KvRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('k')) {
      context.handle(_kMeta, k.isAcceptableOrUnknown(data['k']!, _kMeta));
    } else if (isInserting) {
      context.missing(_kMeta);
    }
    if (data.containsKey('v')) {
      context.handle(_vMeta, v.isAcceptableOrUnknown(data['v']!, _vMeta));
    } else if (isInserting) {
      context.missing(_vMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {k};
  @override
  KvRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return KvRow(
      k: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}k'],
      )!,
      v: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}v'],
      )!,
    );
  }

  @override
  $KvTable createAlias(String alias) {
    return $KvTable(attachedDatabase, alias);
  }
}

class KvRow extends DataClass implements Insertable<KvRow> {
  final String k;
  final String v;
  const KvRow({required this.k, required this.v});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['k'] = Variable<String>(k);
    map['v'] = Variable<String>(v);
    return map;
  }

  KvCompanion toCompanion(bool nullToAbsent) {
    return KvCompanion(k: Value(k), v: Value(v));
  }

  factory KvRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return KvRow(
      k: serializer.fromJson<String>(json['k']),
      v: serializer.fromJson<String>(json['v']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'k': serializer.toJson<String>(k),
      'v': serializer.toJson<String>(v),
    };
  }

  KvRow copyWith({String? k, String? v}) =>
      KvRow(k: k ?? this.k, v: v ?? this.v);
  KvRow copyWithCompanion(KvCompanion data) {
    return KvRow(
      k: data.k.present ? data.k.value : this.k,
      v: data.v.present ? data.v.value : this.v,
    );
  }

  @override
  String toString() {
    return (StringBuffer('KvRow(')
          ..write('k: $k, ')
          ..write('v: $v')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(k, v);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is KvRow && other.k == this.k && other.v == this.v);
}

class KvCompanion extends UpdateCompanion<KvRow> {
  final Value<String> k;
  final Value<String> v;
  final Value<int> rowid;
  const KvCompanion({
    this.k = const Value.absent(),
    this.v = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  KvCompanion.insert({
    required String k,
    required String v,
    this.rowid = const Value.absent(),
  }) : k = Value(k),
       v = Value(v);
  static Insertable<KvRow> custom({
    Expression<String>? k,
    Expression<String>? v,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (k != null) 'k': k,
      if (v != null) 'v': v,
      if (rowid != null) 'rowid': rowid,
    });
  }

  KvCompanion copyWith({
    Value<String>? k,
    Value<String>? v,
    Value<int>? rowid,
  }) {
    return KvCompanion(
      k: k ?? this.k,
      v: v ?? this.v,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (k.present) {
      map['k'] = Variable<String>(k.value);
    }
    if (v.present) {
      map['v'] = Variable<String>(v.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('KvCompanion(')
          ..write('k: $k, ')
          ..write('v: $v, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $RecordsTable records = $RecordsTable(this);
  late final $TombstonesTable tombstones = $TombstonesTable(this);
  late final $OutboxTable outbox = $OutboxTable(this);
  late final $RejectedOpsTable rejectedOps = $RejectedOpsTable(this);
  late final $KvTable kv = $KvTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    records,
    tombstones,
    outbox,
    rejectedOps,
    kv,
  ];
  @override
  DriftDatabaseOptions get options =>
      const DriftDatabaseOptions(storeDateTimeAsText: true);
}

typedef $$RecordsTableCreateCompanionBuilder = RecordsCompanion Function({
  required String t,
  required String id,
  required String json,
  Value<String?> updatedAt,
  Value<int> rowid,
});
typedef $$RecordsTableUpdateCompanionBuilder = RecordsCompanion Function({
  Value<String> t,
  Value<String> id,
  Value<String> json,
  Value<String?> updatedAt,
  Value<int> rowid,
});

class $$RecordsTableFilterComposer
    extends Composer<_$AppDatabase, $RecordsTable> {
  $$RecordsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get t => $composableBuilder(
    column: $table.t,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get json => $composableBuilder(
    column: $table.json,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$RecordsTableOrderingComposer
    extends Composer<_$AppDatabase, $RecordsTable> {
  $$RecordsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get t => $composableBuilder(
    column: $table.t,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get json => $composableBuilder(
    column: $table.json,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$RecordsTableAnnotationComposer
    extends Composer<_$AppDatabase, $RecordsTable> {
  $$RecordsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get t =>
      $composableBuilder(column: $table.t, builder: (column) => column);

  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get json =>
      $composableBuilder(column: $table.json, builder: (column) => column);

  GeneratedColumn<String> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$RecordsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $RecordsTable,
          RecordRow,
          $$RecordsTableFilterComposer,
          $$RecordsTableOrderingComposer,
          $$RecordsTableAnnotationComposer,
          $$RecordsTableCreateCompanionBuilder,
          $$RecordsTableUpdateCompanionBuilder,
          (RecordRow, BaseReferences<_$AppDatabase, $RecordsTable, RecordRow>),
          RecordRow,
          PrefetchHooks Function()
        > {
  $$RecordsTableTableManager(_$AppDatabase db, $RecordsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$RecordsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$RecordsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$RecordsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> t = const Value.absent(),
                Value<String> id = const Value.absent(),
                Value<String> json = const Value.absent(),
                Value<String?> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => RecordsCompanion(
                t: t,
                id: id,
                json: json,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String t,
                required String id,
                required String json,
                Value<String?> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => RecordsCompanion.insert(
                t: t,
                id: id,
                json: json,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$RecordsTable, RecordRow>(table),
                  BaseReferences<_$AppDatabase, $RecordsTable, RecordRow>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$RecordsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $RecordsTable,
      RecordRow,
      $$RecordsTableFilterComposer,
      $$RecordsTableOrderingComposer,
      $$RecordsTableAnnotationComposer,
      $$RecordsTableCreateCompanionBuilder,
      $$RecordsTableUpdateCompanionBuilder,
      (RecordRow, BaseReferences<_$AppDatabase, $RecordsTable, RecordRow>),
      RecordRow,
      PrefetchHooks Function()
    >;
typedef $$TombstonesTableCreateCompanionBuilder = TombstonesCompanion Function({
  required String t,
  required String id,
  required String at,
  Value<int> rowid,
});
typedef $$TombstonesTableUpdateCompanionBuilder = TombstonesCompanion Function({
  Value<String> t,
  Value<String> id,
  Value<String> at,
  Value<int> rowid,
});

class $$TombstonesTableFilterComposer
    extends Composer<_$AppDatabase, $TombstonesTable> {
  $$TombstonesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get t => $composableBuilder(
    column: $table.t,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get at => $composableBuilder(
    column: $table.at,
    builder: (column) => ColumnFilters(column),
  );
}

class $$TombstonesTableOrderingComposer
    extends Composer<_$AppDatabase, $TombstonesTable> {
  $$TombstonesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get t => $composableBuilder(
    column: $table.t,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get at => $composableBuilder(
    column: $table.at,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$TombstonesTableAnnotationComposer
    extends Composer<_$AppDatabase, $TombstonesTable> {
  $$TombstonesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get t =>
      $composableBuilder(column: $table.t, builder: (column) => column);

  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get at =>
      $composableBuilder(column: $table.at, builder: (column) => column);
}

class $$TombstonesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $TombstonesTable,
          TombstoneRow,
          $$TombstonesTableFilterComposer,
          $$TombstonesTableOrderingComposer,
          $$TombstonesTableAnnotationComposer,
          $$TombstonesTableCreateCompanionBuilder,
          $$TombstonesTableUpdateCompanionBuilder,
          (
            TombstoneRow,
            BaseReferences<_$AppDatabase, $TombstonesTable, TombstoneRow>,
          ),
          TombstoneRow,
          PrefetchHooks Function()
        > {
  $$TombstonesTableTableManager(_$AppDatabase db, $TombstonesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$TombstonesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$TombstonesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$TombstonesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> t = const Value.absent(),
            Value<String> id = const Value.absent(),
            Value<String> at = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => TombstonesCompanion(t: t, id: id, at: at, rowid: rowid),
          createCompanionCallback: ({
            required String t,
            required String id,
            required String at,
            Value<int> rowid = const Value.absent(),
          }) => TombstonesCompanion.insert(t: t, id: id, at: at, rowid: rowid),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$TombstonesTable, TombstoneRow>(table),
                  BaseReferences<_$AppDatabase, $TombstonesTable, TombstoneRow>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$TombstonesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $TombstonesTable,
      TombstoneRow,
      $$TombstonesTableFilterComposer,
      $$TombstonesTableOrderingComposer,
      $$TombstonesTableAnnotationComposer,
      $$TombstonesTableCreateCompanionBuilder,
      $$TombstonesTableUpdateCompanionBuilder,
      (
        TombstoneRow,
        BaseReferences<_$AppDatabase, $TombstonesTable, TombstoneRow>,
      ),
      TombstoneRow,
      PrefetchHooks Function()
    >;
typedef $$OutboxTableCreateCompanionBuilder = OutboxCompanion Function({
  Value<int> seq,
  required String op,
  required String txn,
  required String t,
  required String id,
  Value<bool> deleted,
  required String at,
});
typedef $$OutboxTableUpdateCompanionBuilder = OutboxCompanion Function({
  Value<int> seq,
  Value<String> op,
  Value<String> txn,
  Value<String> t,
  Value<String> id,
  Value<bool> deleted,
  Value<String> at,
});

class $$OutboxTableFilterComposer
    extends Composer<_$AppDatabase, $OutboxTable> {
  $$OutboxTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get seq => $composableBuilder(
    column: $table.seq,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get op => $composableBuilder(
    column: $table.op,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get txn => $composableBuilder(
    column: $table.txn,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get t => $composableBuilder(
    column: $table.t,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get deleted => $composableBuilder(
    column: $table.deleted,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get at => $composableBuilder(
    column: $table.at,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OutboxTableOrderingComposer
    extends Composer<_$AppDatabase, $OutboxTable> {
  $$OutboxTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get seq => $composableBuilder(
    column: $table.seq,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get op => $composableBuilder(
    column: $table.op,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get txn => $composableBuilder(
    column: $table.txn,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get t => $composableBuilder(
    column: $table.t,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get deleted => $composableBuilder(
    column: $table.deleted,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get at => $composableBuilder(
    column: $table.at,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OutboxTableAnnotationComposer
    extends Composer<_$AppDatabase, $OutboxTable> {
  $$OutboxTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get seq =>
      $composableBuilder(column: $table.seq, builder: (column) => column);

  GeneratedColumn<String> get op =>
      $composableBuilder(column: $table.op, builder: (column) => column);

  GeneratedColumn<String> get txn =>
      $composableBuilder(column: $table.txn, builder: (column) => column);

  GeneratedColumn<String> get t =>
      $composableBuilder(column: $table.t, builder: (column) => column);

  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<bool> get deleted =>
      $composableBuilder(column: $table.deleted, builder: (column) => column);

  GeneratedColumn<String> get at =>
      $composableBuilder(column: $table.at, builder: (column) => column);
}

class $$OutboxTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $OutboxTable,
          OutboxRow,
          $$OutboxTableFilterComposer,
          $$OutboxTableOrderingComposer,
          $$OutboxTableAnnotationComposer,
          $$OutboxTableCreateCompanionBuilder,
          $$OutboxTableUpdateCompanionBuilder,
          (OutboxRow, BaseReferences<_$AppDatabase, $OutboxTable, OutboxRow>),
          OutboxRow,
          PrefetchHooks Function()
        > {
  $$OutboxTableTableManager(_$AppDatabase db, $OutboxTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OutboxTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OutboxTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OutboxTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> seq = const Value.absent(),
                Value<String> op = const Value.absent(),
                Value<String> txn = const Value.absent(),
                Value<String> t = const Value.absent(),
                Value<String> id = const Value.absent(),
                Value<bool> deleted = const Value.absent(),
                Value<String> at = const Value.absent(),
              }) => OutboxCompanion(
                seq: seq,
                op: op,
                txn: txn,
                t: t,
                id: id,
                deleted: deleted,
                at: at,
              ),
          createCompanionCallback:
              ({
                Value<int> seq = const Value.absent(),
                required String op,
                required String txn,
                required String t,
                required String id,
                Value<bool> deleted = const Value.absent(),
                required String at,
              }) => OutboxCompanion.insert(
                seq: seq,
                op: op,
                txn: txn,
                t: t,
                id: id,
                deleted: deleted,
                at: at,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$OutboxTable, OutboxRow>(table),
                  BaseReferences<_$AppDatabase, $OutboxTable, OutboxRow>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OutboxTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $OutboxTable,
      OutboxRow,
      $$OutboxTableFilterComposer,
      $$OutboxTableOrderingComposer,
      $$OutboxTableAnnotationComposer,
      $$OutboxTableCreateCompanionBuilder,
      $$OutboxTableUpdateCompanionBuilder,
      (OutboxRow, BaseReferences<_$AppDatabase, $OutboxTable, OutboxRow>),
      OutboxRow,
      PrefetchHooks Function()
    >;
typedef $$RejectedOpsTableCreateCompanionBuilder =
    RejectedOpsCompanion Function({
      Value<int> seq,
      required String op,
      required String t,
      required String id,
      required String at,
      Value<String?> reason,
    });
typedef $$RejectedOpsTableUpdateCompanionBuilder =
    RejectedOpsCompanion Function({
      Value<int> seq,
      Value<String> op,
      Value<String> t,
      Value<String> id,
      Value<String> at,
      Value<String?> reason,
    });

class $$RejectedOpsTableFilterComposer
    extends Composer<_$AppDatabase, $RejectedOpsTable> {
  $$RejectedOpsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get seq => $composableBuilder(
    column: $table.seq,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get op => $composableBuilder(
    column: $table.op,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get t => $composableBuilder(
    column: $table.t,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get at => $composableBuilder(
    column: $table.at,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get reason => $composableBuilder(
    column: $table.reason,
    builder: (column) => ColumnFilters(column),
  );
}

class $$RejectedOpsTableOrderingComposer
    extends Composer<_$AppDatabase, $RejectedOpsTable> {
  $$RejectedOpsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get seq => $composableBuilder(
    column: $table.seq,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get op => $composableBuilder(
    column: $table.op,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get t => $composableBuilder(
    column: $table.t,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get at => $composableBuilder(
    column: $table.at,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get reason => $composableBuilder(
    column: $table.reason,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$RejectedOpsTableAnnotationComposer
    extends Composer<_$AppDatabase, $RejectedOpsTable> {
  $$RejectedOpsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get seq =>
      $composableBuilder(column: $table.seq, builder: (column) => column);

  GeneratedColumn<String> get op =>
      $composableBuilder(column: $table.op, builder: (column) => column);

  GeneratedColumn<String> get t =>
      $composableBuilder(column: $table.t, builder: (column) => column);

  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get at =>
      $composableBuilder(column: $table.at, builder: (column) => column);

  GeneratedColumn<String> get reason =>
      $composableBuilder(column: $table.reason, builder: (column) => column);
}

class $$RejectedOpsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $RejectedOpsTable,
          RejectedRow,
          $$RejectedOpsTableFilterComposer,
          $$RejectedOpsTableOrderingComposer,
          $$RejectedOpsTableAnnotationComposer,
          $$RejectedOpsTableCreateCompanionBuilder,
          $$RejectedOpsTableUpdateCompanionBuilder,
          (
            RejectedRow,
            BaseReferences<_$AppDatabase, $RejectedOpsTable, RejectedRow>,
          ),
          RejectedRow,
          PrefetchHooks Function()
        > {
  $$RejectedOpsTableTableManager(_$AppDatabase db, $RejectedOpsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$RejectedOpsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$RejectedOpsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$RejectedOpsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> seq = const Value.absent(),
                Value<String> op = const Value.absent(),
                Value<String> t = const Value.absent(),
                Value<String> id = const Value.absent(),
                Value<String> at = const Value.absent(),
                Value<String?> reason = const Value.absent(),
              }) => RejectedOpsCompanion(
                seq: seq,
                op: op,
                t: t,
                id: id,
                at: at,
                reason: reason,
              ),
          createCompanionCallback:
              ({
                Value<int> seq = const Value.absent(),
                required String op,
                required String t,
                required String id,
                required String at,
                Value<String?> reason = const Value.absent(),
              }) => RejectedOpsCompanion.insert(
                seq: seq,
                op: op,
                t: t,
                id: id,
                at: at,
                reason: reason,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$RejectedOpsTable, RejectedRow>(table),
                  BaseReferences<_$AppDatabase, $RejectedOpsTable, RejectedRow>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$RejectedOpsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $RejectedOpsTable,
      RejectedRow,
      $$RejectedOpsTableFilterComposer,
      $$RejectedOpsTableOrderingComposer,
      $$RejectedOpsTableAnnotationComposer,
      $$RejectedOpsTableCreateCompanionBuilder,
      $$RejectedOpsTableUpdateCompanionBuilder,
      (
        RejectedRow,
        BaseReferences<_$AppDatabase, $RejectedOpsTable, RejectedRow>,
      ),
      RejectedRow,
      PrefetchHooks Function()
    >;
typedef $$KvTableCreateCompanionBuilder = KvCompanion Function({
  required String k,
  required String v,
  Value<int> rowid,
});
typedef $$KvTableUpdateCompanionBuilder = KvCompanion Function({
  Value<String> k,
  Value<String> v,
  Value<int> rowid,
});

class $$KvTableFilterComposer extends Composer<_$AppDatabase, $KvTable> {
  $$KvTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get k => $composableBuilder(
    column: $table.k,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get v => $composableBuilder(
    column: $table.v,
    builder: (column) => ColumnFilters(column),
  );
}

class $$KvTableOrderingComposer extends Composer<_$AppDatabase, $KvTable> {
  $$KvTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get k => $composableBuilder(
    column: $table.k,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get v => $composableBuilder(
    column: $table.v,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$KvTableAnnotationComposer extends Composer<_$AppDatabase, $KvTable> {
  $$KvTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get k =>
      $composableBuilder(column: $table.k, builder: (column) => column);

  GeneratedColumn<String> get v =>
      $composableBuilder(column: $table.v, builder: (column) => column);
}

class $$KvTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $KvTable,
          KvRow,
          $$KvTableFilterComposer,
          $$KvTableOrderingComposer,
          $$KvTableAnnotationComposer,
          $$KvTableCreateCompanionBuilder,
          $$KvTableUpdateCompanionBuilder,
          (KvRow, BaseReferences<_$AppDatabase, $KvTable, KvRow>),
          KvRow,
          PrefetchHooks Function()
        > {
  $$KvTableTableManager(_$AppDatabase db, $KvTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$KvTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$KvTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$KvTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> k = const Value.absent(),
            Value<String> v = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => KvCompanion(k: k, v: v, rowid: rowid),
          createCompanionCallback: ({
            required String k,
            required String v,
            Value<int> rowid = const Value.absent(),
          }) => KvCompanion.insert(k: k, v: v, rowid: rowid),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$KvTable, KvRow>(table),
                  BaseReferences<_$AppDatabase, $KvTable, KvRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$KvTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $KvTable,
      KvRow,
      $$KvTableFilterComposer,
      $$KvTableOrderingComposer,
      $$KvTableAnnotationComposer,
      $$KvTableCreateCompanionBuilder,
      $$KvTableUpdateCompanionBuilder,
      (KvRow, BaseReferences<_$AppDatabase, $KvTable, KvRow>),
      KvRow,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$RecordsTableTableManager get records =>
      $$RecordsTableTableManager(_db, _db.records);
  $$TombstonesTableTableManager get tombstones =>
      $$TombstonesTableTableManager(_db, _db.tombstones);
  $$OutboxTableTableManager get outbox =>
      $$OutboxTableTableManager(_db, _db.outbox);
  $$RejectedOpsTableTableManager get rejectedOps =>
      $$RejectedOpsTableTableManager(_db, _db.rejectedOps);
  $$KvTableTableManager get kv => $$KvTableTableManager(_db, _db.kv);
}

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(appDatabase)
final appDatabaseProvider = AppDatabaseProvider._();

final class AppDatabaseProvider
    extends $FunctionalProvider<AppDatabase, AppDatabase, AppDatabase>
    with $Provider<AppDatabase> {
  AppDatabaseProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'appDatabaseProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$appDatabaseHash();

  @$internal
  @override
  $ProviderElement<AppDatabase> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  AppDatabase create(Ref ref) {
    return appDatabase(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(AppDatabase value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<AppDatabase>(value),
    );
  }
}

String _$appDatabaseHash() => r'59cce38d45eeaba199eddd097d8e149d66f9f3e1';
