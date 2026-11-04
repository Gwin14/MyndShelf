package com.myndshelf.drive

import android.database.Cursor
import android.database.MatrixCursor
import android.os.CancellationSignal
import android.os.Handler
import android.os.HandlerThread
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import android.provider.DocumentsContract.Root
import android.provider.DocumentsProvider
import android.util.Log
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileNotFoundException

/**
 * A Estante do MyndShelf no app Arquivos do Android e no seletor de documentos
 * de qualquer app. Estantes são pastas; criações com original são arquivos.
 * Os arquivos baixam ao abrir (cache do app) e sobem ao fechar depois de editados.
 */
class DriveDocumentsProvider : DocumentsProvider() {
  companion object {
    private const val TAG = "MyndShelfDrive"
    private const val ROOT_ID = "myndshelf"
    private const val TTL = 5_000L

    private val ROOT_COLUMNS = arrayOf(
      Root.COLUMN_ROOT_ID, Root.COLUMN_FLAGS, Root.COLUMN_ICON, Root.COLUMN_TITLE, Root.COLUMN_SUMMARY, Root.COLUMN_DOCUMENT_ID,
    )
    private val DOC_COLUMNS = arrayOf(
      Document.COLUMN_DOCUMENT_ID, Document.COLUMN_MIME_TYPE, Document.COLUMN_DISPLAY_NAME,
      Document.COLUMN_LAST_MODIFIED, Document.COLUMN_FLAGS, Document.COLUMN_SIZE,
    )

    fun authority(packageName: String) = "$packageName.drive"
  }

  private var cache: List<DriveItem> = emptyList()
  private var cachedAt = 0L
  private val io by lazy { Handler(HandlerThread("myndshelf-drive").apply { start() }.looper) }

  private val ctx get() = context ?: throw IllegalStateException("sem contexto")
  private val authority get() = authority(ctx.packageName)

  override fun onCreate() = true

  private fun api(): DriveApi = DriveApi.from(ctx) ?: throw FileNotFoundException("MyndShelf não está ligado a um servidor")

  @Synchronized
  private fun items(fresh: Boolean = false): List<DriveItem> {
    if (fresh || System.currentTimeMillis() - cachedAt > TTL) {
      cache = api().list()
      cachedAt = System.currentTimeMillis()
    }
    return cache
  }

  @Synchronized
  private fun invalidate(vararg parents: String) {
    cachedAt = 0
    for (p in parents.toSet()) ctx.contentResolver.notifyChange(DocumentsContract.buildChildDocumentsUri(authority, p), null)
  }

  private fun item(id: String) = items().firstOrNull { it.id == id } ?: items(fresh = true).firstOrNull { it.id == id }
    ?: throw FileNotFoundException(id)

  private fun mimeOf(i: DriveItem): String {
    if (i.isFolder) return Document.MIME_TYPE_DIR
    val ext = i.name.substringAfterLast('.', "").lowercase()
    return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: i.mime ?: "application/octet-stream"
  }

  private fun addRoot(c: MatrixCursor) {
    c.newRow().apply {
      add(Document.COLUMN_DOCUMENT_ID, DriveApi.ROOT)
      add(Document.COLUMN_MIME_TYPE, Document.MIME_TYPE_DIR)
      add(Document.COLUMN_DISPLAY_NAME, "MyndShelf")
      add(Document.COLUMN_FLAGS, Document.FLAG_DIR_SUPPORTS_CREATE)
      add(Document.COLUMN_SIZE, null)
      add(Document.COLUMN_LAST_MODIFIED, null)
    }
  }

  private fun addItem(c: MatrixCursor, i: DriveItem) {
    val flags = if (i.isFolder) {
      Document.FLAG_DIR_SUPPORTS_CREATE or Document.FLAG_SUPPORTS_RENAME or Document.FLAG_SUPPORTS_DELETE
    } else {
      Document.FLAG_SUPPORTS_WRITE or Document.FLAG_SUPPORTS_RENAME or Document.FLAG_SUPPORTS_DELETE or Document.FLAG_SUPPORTS_MOVE
    }
    c.newRow().apply {
      add(Document.COLUMN_DOCUMENT_ID, i.id)
      add(Document.COLUMN_MIME_TYPE, mimeOf(i))
      add(Document.COLUMN_DISPLAY_NAME, i.name)
      add(Document.COLUMN_FLAGS, flags)
      add(Document.COLUMN_SIZE, if (i.isFolder) null else i.size)
      add(Document.COLUMN_LAST_MODIFIED, if (i.createdAt > 0) i.createdAt else null)
    }
  }

  override fun queryRoots(projection: Array<out String>?): Cursor {
    val c = MatrixCursor(projection ?: ROOT_COLUMNS)
    val cfg = DriveConfig.load(ctx) ?: return c
    c.newRow().apply {
      add(Root.COLUMN_ROOT_ID, ROOT_ID)
      add(Root.COLUMN_FLAGS, Root.FLAG_SUPPORTS_CREATE or Root.FLAG_SUPPORTS_IS_CHILD)
      add(Root.COLUMN_ICON, ctx.applicationInfo.icon)
      add(Root.COLUMN_TITLE, "MyndShelf")
      add(Root.COLUMN_SUMMARY, cfg.first.removePrefix("https://").removePrefix("http://"))
      add(Root.COLUMN_DOCUMENT_ID, DriveApi.ROOT)
    }
    c.setNotificationUri(ctx.contentResolver, DocumentsContract.buildRootsUri(authority))
    return c
  }

  override fun queryDocument(documentId: String, projection: Array<out String>?): Cursor {
    val c = MatrixCursor(projection ?: DOC_COLUMNS)
    if (documentId == DriveApi.ROOT) addRoot(c) else addItem(c, item(documentId))
    return c
  }

  override fun queryChildDocuments(parentDocumentId: String, projection: Array<out String>?, sortOrder: String?): Cursor {
    val c = MatrixCursor(projection ?: DOC_COLUMNS)
    try {
      items().filter { it.parentId == parentDocumentId }.sortedWith(compareBy({ !it.isFolder }, { it.name.lowercase() })).forEach { addItem(c, it) }
    } catch (e: Exception) {
      Log.w(TAG, "lista", e)
      if (e is FileNotFoundException) throw e
    }
    c.setNotificationUri(ctx.contentResolver, DocumentsContract.buildChildDocumentsUri(authority, parentDocumentId))
    return c
  }

  override fun isChildDocument(parentDocumentId: String, documentId: String): Boolean {
    if (parentDocumentId == DriveApi.ROOT) return true
    return runCatching { item(documentId).parentId == parentDocumentId }.getOrDefault(false)
  }

  private fun cacheFile(i: DriveItem) = File(ctx.cacheDir, "drive/${i.id}.${i.contentVersion}")

  override fun openDocument(documentId: String, mode: String, signal: CancellationSignal?): ParcelFileDescriptor {
    val i = item(documentId)
    if (i.isFolder) throw FileNotFoundException("é uma pasta")
    val cached = cacheFile(i)
    val truncate = mode.contains('t') || mode == "w"
    if (!cached.exists() && !truncate) {
      try {
        api().download(i.id, cached)
      } catch (e: Exception) {
        throw FileNotFoundException("não deu para baixar: ${e.message}")
      }
    }
    if (mode == "r") return ParcelFileDescriptor.open(cached, ParcelFileDescriptor.MODE_READ_ONLY)

    // escrita numa cópia; sobe ao fechar
    val work = File(ctx.cacheDir, "drive/edit-${i.id}-${System.nanoTime()}")
    work.parentFile?.mkdirs()
    if (truncate || !cached.exists()) work.writeBytes(ByteArray(0)) else cached.copyTo(work, overwrite = true)
    return ParcelFileDescriptor.open(work, ParcelFileDescriptor.parseMode(mode), io) { err ->
      if (err != null) {
        work.delete()
        return@open
      }
      Thread {
        try {
          val updated = api().replaceFile(i.id, work, mimeOf(i))
          work.renameTo(cacheFile(updated))
          invalidate(i.parentId)
        } catch (e: Exception) {
          Log.w(TAG, "não subiu ${i.name}", e)
        }
      }.start()
    }
  }

  override fun createDocument(parentDocumentId: String, mimeType: String, displayName: String): String {
    val api = api()
    try {
      val item = if (mimeType == Document.MIME_TYPE_DIR) {
        // estantes não têm subpastas
        if (parentDocumentId != DriveApi.ROOT) throw UnsupportedOperationException("Estantes não têm subpastas")
        api.mkdir(displayName)
      } else {
        // nasce vazio; o conteúdo chega pelo openDocument("w") logo em seguida
        val empty = File.createTempFile("new", null, ctx.cacheDir)
        try {
          api.createFile(parentDocumentId, displayName, empty, mimeType)
        } finally {
          empty.delete()
        }
      }
      invalidate(parentDocumentId)
      return item.id
    } catch (e: UnsupportedOperationException) {
      throw e
    } catch (e: Exception) {
      throw FileNotFoundException("não deu para criar: ${e.message}")
    }
  }

  override fun renameDocument(documentId: String, displayName: String): String? {
    val i = item(documentId)
    api().patch(documentId, name = displayName)
    invalidate(i.parentId)
    return null
  }

  override fun moveDocument(sourceDocumentId: String, sourceParentDocumentId: String, targetParentDocumentId: String): String {
    val i = item(sourceDocumentId)
    if (i.isFolder) throw UnsupportedOperationException("Estantes ficam na raiz")
    api().patch(sourceDocumentId, parent = targetParentDocumentId)
    invalidate(sourceParentDocumentId, targetParentDocumentId)
    return sourceDocumentId
  }

  override fun deleteDocument(documentId: String) {
    val api = api()
    val i = item(documentId)
    // apagar a pasta apaga o que está dentro (o servidor só devolveria à raiz)
    if (i.isFolder) items(fresh = true).filter { it.parentId == documentId }.forEach { api.delete(it.id) }
    api.delete(documentId)
    invalidate(i.parentId, documentId)
  }

  override fun removeDocument(documentId: String, parentDocumentId: String) = deleteDocument(documentId)
}
