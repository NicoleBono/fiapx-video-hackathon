import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VideoStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  email: string;

  @Column()
  originalFilename: string;

  @Column({ type: 'enum', enum: VideoStatus, default: VideoStatus.PENDING })
  status: VideoStatus;

  @Column({ type: 'varchar', nullable: true })
  zipObjectKey: string | null;

  @Column({ type: 'int', nullable: true })
  frameCount: number | null;

  @Column({ type: 'varchar', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
