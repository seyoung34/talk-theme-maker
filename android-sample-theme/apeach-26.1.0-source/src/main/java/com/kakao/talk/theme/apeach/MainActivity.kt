package com.kakao.talk.theme.apeach

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import com.kakao.talk.theme.apeach.databinding.MainActivityBinding

open class MainActivity : Activity() {

    private lateinit var binding: MainActivityBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enableEdgeToEdge()

        binding = MainActivityBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setInsetListener(binding.root)

        binding.apply.setOnClickListener {
            val intent = Intent(Intent.ACTION_VIEW)
            intent.data = Uri.parse(KAKAOTALK_SETTINGS_THEME_URI + packageName)
            startActivity(intent)
            finish()
        }

        binding.market.setOnClickListener {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(MARKET_URI + KAKAOTALK_PACKAGE_NAME))
            startActivity(intent)
            finish()
        }

        if (isKakaoTalkInstalled()) {
            binding.apply.visibility = View.VISIBLE
            binding.market.visibility = View.GONE
        } else {
            binding.apply.visibility = View.GONE
            binding.market.visibility = View.VISIBLE
        }
    }

    private fun enableEdgeToEdge() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    )
        }
    }

    private fun setInsetListener(rootView: View) {
        rootView.setOnApplyWindowInsetsListener { view, insets ->
            setPaddingForInsets(view = view, insets = insets)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.view.WindowInsets.CONSUMED
            } else {
                @Suppress("DEPRECATION")
                insets.consumeSystemWindowInsets()
            }
        }
    }

    private fun setPaddingForInsets(view: View, insets: android.view.WindowInsets) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // API 29 (Android 10) 이상
            val systemBars = insets.getInsets(android.view.WindowInsets.Type.systemBars())
            view.setPadding(
                systemBars.left,
                systemBars.top, // 상단 상태바 인셋 적용
                systemBars.right,
                systemBars.bottom // 하단 내비게이션 바 인셋 적용
            )
        } else {
            // API 28 이하
            @Suppress("DEPRECATION")
            view.setPadding(
                insets.systemWindowInsetLeft,
                insets.systemWindowInsetTop, // 상단 상태바 인셋 적용
                insets.systemWindowInsetRight,
                insets.systemWindowInsetBottom // 하단 내비게이션 바 인셋 적용
            )
        }
    }

    open fun isKakaoTalkInstalled(): Boolean {
        return try {
            packageManager.getPackageInfo(KAKAOTALK_PACKAGE_NAME, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    companion object {
        private const val KAKAOTALK_SETTINGS_THEME_URI = "kakaotalk://settings/theme/"
        private const val MARKET_URI = "market://details?id="
        const val KAKAOTALK_PACKAGE_NAME = "com.kakao.talk"
    }
}
