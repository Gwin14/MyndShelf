package com.myndshelf.drive

import android.content.Context
import android.provider.DocumentsContract
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** O app liga/desliga o drive e avisa o sistema quando algo mudou. */
class MyndShelfDriveModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun notifyRoots() {
    val authority = DriveDocumentsProvider.authority(ctx.packageName)
    ctx.contentResolver.notifyChange(DocumentsContract.buildRootsUri(authority), null)
    ctx.contentResolver.notifyChange(DocumentsContract.buildChildDocumentsUri(authority, DriveApi.ROOT), null)
  }

  override fun definition() = ModuleDefinition {
    Name("MyndShelfDrive")

    AsyncFunction("enable") { url: String, token: String ->
      DriveConfig.save(ctx, url, token)
      notifyRoots()
    }

    AsyncFunction("disable") {
      DriveConfig.clear(ctx)
      notifyRoots()
    }

    AsyncFunction("refresh") {
      notifyRoots()
    }
  }
}
