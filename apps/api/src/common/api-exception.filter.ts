import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

function messageFromException(exception: unknown) {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const message = (response as { message?: string | string[] }).message;
      if (Array.isArray(message)) return message.join(' ');
      if (message) return message;
    }
    return exception.message;
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') return 'Já existe um cadastro com essas informações.';
    if (exception.code === 'P2003') return 'Não foi possível salvar porque há uma referência inválida.';
    if (exception.code === 'P2025') return 'Registro não encontrado.';
  }

  if (exception instanceof Prisma.PrismaClientValidationError) {
    return 'Algum campo foi preenchido em formato inválido. Revise os dados e tente novamente.';
  }

  if (exception instanceof Error) {
    if (/invalid.*decimal|decimal/i.test(exception.message)) return 'Informe um valor numérico válido. Use apenas números, vírgula ou ponto.';
    if (/invalid.*date/i.test(exception.message)) return 'Informe uma data válida.';
  }

  return 'Não foi possível concluir a operação. Revise os dados e tente novamente.';
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.BAD_REQUEST;

    response.status(status).json({
      statusCode: status,
      message: messageFromException(exception),
    });
  }
}
