/**
 * TDD RED Tests for LLM env var passthrough in distributed mode
 *
 * Tests:
 *   1. distributed_runner.py passes LLM_API_KEY to subprocess env
 *   2. distributed_runner.py passes LLM_BASE_URL to subprocess env
 *   3. distributed_runner.py passes LLM_MODEL_NAME to subprocess env  
 *   4. docker-compose.distributed.yml references LLM env vars
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('LLM env var passthrough', () => {

  // ── DistributedRunner Python source ──

  it('distributed_runner.py passes LLM_API_KEY to subprocess', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../MiroFish/backend/app/services/distributed_runner.py'),
      'utf-8'
    );
    assert.ok(
      source.includes('LLM_API_KEY'),
      'distributed_runner.py should reference LLM_API_KEY'
    );
  });

  it('distributed_runner.py passes LLM_BASE_URL to subprocess', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../MiroFish/backend/app/services/distributed_runner.py'),
      'utf-8'
    );
    assert.ok(
      source.includes('LLM_BASE_URL'),
      'distributed_runner.py should reference LLM_BASE_URL'
    );
  });

  it('distributed_runner.py passes LLM_MODEL_NAME to subprocess', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../MiroFish/backend/app/services/distributed_runner.py'),
      'utf-8'
    );
    assert.ok(
      source.includes('LLM_MODEL_NAME'),
      'distributed_runner.py should reference LLM_MODEL_NAME'
    );
  });

  // ── Docker Compose ──

  it('docker-compose.distributed.yml includes LLM_API_KEY', () => {
    const composePath = path.join(__dirname, '../../oasis-distributed/docker-compose.distributed.yml');
    const source = fs.readFileSync(composePath, 'utf-8');
    assert.ok(
      source.includes('LLM_API_KEY'),
      'docker-compose should pass LLM_API_KEY env var'
    );
  });

  it('docker-compose.distributed.yml includes LLM_BASE_URL', () => {
    const composePath = path.join(__dirname, '../../oasis-distributed/docker-compose.distributed.yml');
    const source = fs.readFileSync(composePath, 'utf-8');
    assert.ok(
      source.includes('LLM_BASE_URL'),
      'docker-compose should pass LLM_BASE_URL env var'
    );
  });

  it('docker-compose.distributed.yml includes LLM_MODEL_NAME', () => {
    const composePath = path.join(__dirname, '../../oasis-distributed/docker-compose.distributed.yml');
    const source = fs.readFileSync(composePath, 'utf-8');
    assert.ok(
      source.includes('LLM_MODEL_NAME'),
      'docker-compose should pass LLM_MODEL_NAME env var'
    );
  });
});
