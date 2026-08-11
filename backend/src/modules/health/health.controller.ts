import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Full health check with all dependencies' })
  @ApiResponse({ status: 200, description: 'All dependencies operational' })
  @ApiResponse({ status: 503, description: 'Critical dependencies unavailable' })
  async check(@Res({ passthrough: true }) res: Response) {
    const result = await this.healthService.check();
    if (result.status === 'error') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    } else if (result.status === 'degraded') {
      res.status(HttpStatus.OK);
    }
    return result;
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe - process is running' })
  @ApiResponse({ status: 200, description: 'Liveness check result' })
  async liveness(@Res({ passthrough: true }) res: Response) {
    res.status(HttpStatus.OK);
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe - can serve requests' })
  @ApiResponse({ status: 200, description: 'Ready' })
  @ApiResponse({ status: 503, description: 'Not ready' })
  async readiness(@Res({ passthrough: true }) res: Response) {
    const result = await this.healthService.readiness();
    res.status(result.status === 'ready' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }

  @Get('version')
  @ApiOperation({ summary: 'Application version information' })
  @ApiResponse({ status: 200, description: 'Version info' })
  async version(@Res({ passthrough: true }) res: Response) {
    res.status(HttpStatus.OK);
    return this.healthService.version();
  }
}
