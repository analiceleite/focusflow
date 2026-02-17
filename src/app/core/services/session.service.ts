import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  collectionData,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  DocumentReference
} from '@angular/fire/firestore';
import { ActivityType, Preset, Session} from '../interfaces/timer.interface';
import { AuthService } from './auth.service';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  private get uid(): string {
    return this.auth.currentUser!.uid;
  }

  // ─── Activity Types ──────────────────────────────────────────────────────────

  getActivityTypes$(): Observable<ActivityType[]> {
    const col = collection(this.firestore, 'activityTypes');
    const q = query(col, where('userId', '==', this.uid));
    return collectionData(q, { idField: 'id' }) as Observable<ActivityType[]>;
  }

  async addActivityType(data: Omit<ActivityType, 'userId' | 'id'>): Promise<void> {
    const col = collection(this.firestore, 'activityTypes');
    await addDoc(col, { ...data, userId: this.uid });
  }

  async deleteActivityType(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'activityTypes', id));
  }

  // ─── Presets ─────────────────────────────────────────────────────────────────

  getPresets$(): Observable<Preset[]> {
    const col = collection(this.firestore, 'presets');
    const q = query(col, where('userId', '==', this.uid));
    return collectionData(q, { idField: 'id' }) as Observable<Preset[]>;
  }

  async addPreset(data: Omit<Preset, 'userId' | 'id'>): Promise<void> {
    const col = collection(this.firestore, 'presets');
    await addDoc(col, { ...data, userId: this.uid });
  }

  async deletePreset(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'presets', id));
  }

  // ─── Sessions ────────────────────────────────────────────────────────────────

  getSessions$(): Observable<Session[]> {
    const col = collection(this.firestore, 'sessions');
    const q = query(
      col,
      where('userId', '==', this.uid),
      orderBy('startedAt', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Session[]>;
  }

  async saveSession(session: Omit<Session, 'userId' | 'id'>): Promise<void> {
    const col = collection(this.firestore, 'sessions');
    await addDoc(col, { ...session, userId: this.uid });
  }

  async deleteSession(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'sessions', id));
  }

  // ─── Seed default data ────────────────────────────────────────────────────────

  async seedDefaultData(): Promise<void> {
    const col = collection(this.firestore, 'activityTypes');
    const q = query(col, where('userId', '==', this.uid));
    const snapshot = await getDoc(doc(this.firestore, `userMeta/${this.uid}`));

    if (snapshot.exists()) return; // already seeded

    const defaults: Omit<ActivityType, 'userId' | 'id'>[] = [
      { name: 'Estudo', icon: '📚', color: '#6C63FF' },
      { name: 'Trabalho', icon: '💼', color: '#FF6584' },
      { name: 'Exercício', icon: '🏋️', color: '#43D9AD' },
      { name: 'Leitura', icon: '📖', color: '#F4A261' },
      { name: 'Meditação', icon: '🧘', color: '#A8DADC' },
      { name: 'Projeto Pessoal', icon: '🚀', color: '#F7C948' },
    ];

    const defaultPresets: Omit<Preset, 'userId' | 'id'>[] = [
      { label: '25 min', minutes: 25 },
      { label: '50 min', minutes: 50 },
      { label: '90 min', minutes: 90 },
    ];

    for (const d of defaults) {
      await addDoc(collection(this.firestore, 'activityTypes'), { ...d, userId: this.uid });
    }
    for (const p of defaultPresets) {
      await addDoc(collection(this.firestore, 'presets'), { ...p, userId: this.uid });
    }

    await setDoc(doc(this.firestore, `userMeta/${this.uid}`), { seeded: true });
  }
}
