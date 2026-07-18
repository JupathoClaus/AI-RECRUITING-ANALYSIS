import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  CandidateNoteVisibility,
  ApplicationAuditEventType,
  ApplicationActorType,
} from '@prisma/client';
import { ApplicationAuditService } from './application-audit.service';
import { CreateNoteDto, UpdateNoteDto } from '../dto/note.dto';

@Injectable()
export class ApplicationNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ApplicationAuditService,
  ) {}

  async getNotes(applicationId: string, companyId: string, membershipId: string) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });

    const notes = await this.prisma.applicationNote.findMany({
      where: { applicationId, companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    // Apply visibility filter
    return notes.filter((n) => {
      if (n.visibility === CandidateNoteVisibility.COMPANY) return true;
      if (n.visibility === CandidateNoteVisibility.PRIVATE)
        return n.authorMembershipId === membershipId;
      return true; // HIRING_TEAM — simplified: allow all company members for now
    });
  }

  async createNote(
    applicationId: string,
    companyId: string,
    dto: CreateNoteDto,
    membershipId: string,
    requestId?: string,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.applicationNote.create({
        data: {
          applicationId,
          companyId,
          authorMembershipId: membershipId,
          content: dto.content,
          visibility: dto.visibility ?? CandidateNoteVisibility.PRIVATE,
        },
      });
      await this.auditService.record({
        companyId,
        applicationId,
        candidateId: app.candidateId,
        actorType: ApplicationActorType.RECRUITER,
        actorMembershipId: membershipId,
        eventType: ApplicationAuditEventType.APPLICATION_UPDATED,
        entityType: 'ApplicationNote',
        entityId: note.id,
        description: 'Note added to application',
        requestId,
        tx,
      });
      return note;
    });
  }

  async updateNote(
    noteId: string,
    applicationId: string,
    companyId: string,
    dto: UpdateNoteDto,
    membershipId: string,
  ) {
    const note = await this.prisma.applicationNote.findFirst({
      where: { id: noteId, applicationId, companyId, deletedAt: null },
    });
    if (!note)
      throw new NotFoundException({
        code: 'APPLICATION_NOTE_FORBIDDEN',
        message: 'Note not found',
      });
    if (note.authorMembershipId !== membershipId)
      throw new ForbiddenException({
        code: 'APPLICATION_NOTE_FORBIDDEN',
        message: 'Only the author can edit this note',
      });

    return this.prisma.applicationNote.update({
      where: { id: noteId },
      data: {
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.visibility ? { visibility: dto.visibility } : {}),
        editedAt: new Date(),
      },
    });
  }

  async deleteNote(noteId: string, applicationId: string, companyId: string, membershipId: string) {
    const note = await this.prisma.applicationNote.findFirst({
      where: { id: noteId, applicationId, companyId, deletedAt: null },
    });
    if (!note)
      throw new NotFoundException({
        code: 'APPLICATION_NOTE_FORBIDDEN',
        message: 'Note not found',
      });
    if (note.authorMembershipId !== membershipId)
      throw new ForbiddenException({
        code: 'APPLICATION_NOTE_FORBIDDEN',
        message: 'Only the author can delete this note',
      });
    return this.prisma.applicationNote.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });
  }
}
